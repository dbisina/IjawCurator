import { GoogleGenAI, Type, Modality } from "@google/genai";
import { IJAW_LANGUAGE_MASTER_CONTEXT, IJAW_PHONOLOGY_GUIDE, GENERATION_EXAMPLES } from '../prompts/ijawLanguageContext';

// ─── Model names ────────────────────────────────────────────────────────────
const TEXT_MODEL = "gemini-3.1-flash-lite-preview";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

// ─── Key rotation pool ──────────────────────────────────────────────────────
// Reads VITE_GEMINI_API_KEY_1 … _6 from env, falls back to GEMINI_API_KEY.
// All empty / missing slots are silently skipped.
const _buildPool = (): string[] => {
  const numbered = [1, 2, 3, 4, 5, 6]
    .map(n => import.meta.env[`VITE_GEMINI_API_KEY_${n}`] as string | undefined)
    .filter((k): k is string => typeof k === 'string' && k.trim().length > 0);
  if (numbered.length > 0) return numbered;
  // Fallback: single key from process.env (SSR / non-Vite contexts)
  const fallback = (import.meta.env.VITE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY) as string | undefined;
  if (fallback?.trim()) return [fallback.trim()];
  throw new Error("No Gemini API key configured. Set VITE_GEMINI_API_KEY_1 in your .env.local file.");
};

const KEY_POOL: string[] = _buildPool();
let _keyIndex = 0;

/** Returns a GoogleGenAI client for the current key. */
const currentClient = () => new GoogleGenAI({ apiKey: KEY_POOL[_keyIndex] });

/** Advance to the next key (wraps around). */
const rotateKey = () => { _keyIndex = (_keyIndex + 1) % KEY_POOL.length; };

/** True for errors where trying another key might help. */
const isQuotaOrAvailability = (err: unknown): boolean => {
  if (!err) return false;
  const msg = String((err as any)?.message ?? (err as any)?.status ?? err).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('403') ||
    msg.includes('quota') ||
    msg.includes('rate') ||
    msg.includes('unavailable') ||
    msg.includes('blocked') ||
    msg.includes('permission_denied') ||
    msg.includes('resource_exhausted') ||
    (err as any)?.status === 429 ||
    (err as any)?.status === 503 ||
    (err as any)?.status === 403
  );
};

/**
 * Wraps any GoogleGenAI generateContent call with automatic key rotation.
 * On a quota / availability error the next key in the pool is tried immediately.
 * Each key gets one attempt per call — if all keys fail the last error is thrown.
 */
async function withKeyRotation<T>(
  fn: (client: GoogleGenAI) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  // Try every key in the pool starting from the current index
  for (let attempt = 0; attempt < KEY_POOL.length; attempt++) {
    try {
      const result = await fn(currentClient());
      return result;
    } catch (err) {
      lastError = err;
      if (isQuotaOrAvailability(err)) {
        console.warn(
          `[Gemini] Key ${_keyIndex + 1}/${KEY_POOL.length} hit quota/availability error — rotating.`
        );
        rotateKey();
      } else {
        // Non-quota error (bad request, auth, etc.) — don't bother rotating
        throw err;
      }
    }
  }
  throw lastError;
}

// ─── Public interfaces ───────────────────────────────────────────────────────

export interface IjawWord {
  word: string;
  meaning: string;
  pronunciation: string;
  dialect: string;
}

export interface IjawSentence {
  sentence: string;
  meaning: string;
  pronunciation: string;
  dialect: string;
}

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

const DIFFICULTY_GUIDELINES: Record<DifficultyLevel, string> = {
  easy: 'Choose ONLY the most common, everyday words — body parts, numbers 1-10, basic greetings, family terms, colours, simple verbs (eat, drink, go, come, see). These should be words a child or total beginner would learn first.',
  medium: 'Choose moderately common words — occupations, household items, market/trade vocabulary, weather, time expressions, basic emotions. A person with a few months of exposure should recognise these.',
  hard: 'Choose advanced vocabulary — abstract concepts, proverbs, ceremonial/ritual terms, agricultural or fishing terminology specific to Ijaw culture, complex verbs with tonal distinctions.',
};

// ─── Word generation ─────────────────────────────────────────────────────────

export async function generateIjawWords(
  dialect: string,
  count: number = 5,
  difficulty: DifficultyLevel = 'easy',
  existingWords: string[] = [],
  userId?: string
): Promise<IjawWord[]> {
  const exclusionNote = existingWords.length > 0
    ? `\nDO NOT generate any of these words which already exist in the dataset: ${existingWords.slice(0, 30).join(', ')}.`
    : '';

  const userSeed = userId ? userId.slice(-4) : '';

  const exampleWords = GENERATION_EXAMPLES[difficulty]
    .filter(() => true)
    .slice(0, 5)
    .map(e => `  - "${e.ijaw}" = "${e.english}" (${e.dialect})`)
    .join('\n');

  // Step 1: grounded call (Google Search) — returns plain text, parse JSON with regex
  const groundedPrompt = `${IJAW_LANGUAGE_MASTER_CONTEXT}

You are an expert linguist and native speaker of the ${dialect} dialect of the Ijaw language group from the Niger Delta region of Nigeria.

TASK: Search for and list exactly ${count} authentic ${dialect} Ijaw vocabulary words at ${difficulty} level.

DIFFICULTY: ${difficulty.toUpperCase()}
${DIFFICULTY_GUIDELINES[difficulty]}
${exclusionNote}

EXAMPLE REFERENCE WORDS (for style and authenticity — do not repeat these):
${exampleWords}

ADDITIONAL RULES:
- All ${count} entries MUST have completely different English meanings from each other.
- Each Ijaw word must be distinct — no synonyms or near-synonyms.
- The "dialect" field in every entry must be exactly: "${dialect}"
- Do not include loanwords from English, Pidgin, or Yoruba unless they are fully nativised in ${dialect}.
- Prefer concrete, verifiable words over abstract ones, especially for easy difficulty.

GENERATION SEED (for variety): ${userSeed}

Return ONLY a JSON array, no markdown, no explanation:
[{"word":"...","meaning":"...","pronunciation":"...","dialect":"${dialect}"}]

Return a JSON array of exactly ${count} objects.`;

  try {
    const groundedResponse = await withKeyRotation(client =>
      client.models.generateContent({
        model: TEXT_MODEL,
        contents: groundedPrompt,
        config: { tools: [{ googleSearch: {} }] },
      })
    );

    const rawText = groundedResponse.text?.trim() ?? '';
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed: IjawWord[] = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const seen = new Set<string>();
        return parsed.filter(w => {
          const key = w.meaning.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    }
  } catch (groundedError) {
    console.warn("Grounded generation failed, falling back to schema approach:", groundedError);
  }

  // Step 2: JSON schema fallback (no grounding)
  const schemaPrompt = `You are an expert linguist and native speaker of the ${dialect} dialect of the Ijaw language group from the Niger Delta region of Nigeria.

${IJAW_LANGUAGE_MASTER_CONTEXT}

TASK: Generate exactly ${count} vocabulary entries for the ${dialect} Ijaw dialect.

DIFFICULTY: ${difficulty.toUpperCase()}
${DIFFICULTY_GUIDELINES[difficulty]}
${exclusionNote}

ADDITIONAL RULES:
- All ${count} entries MUST have completely different English meanings from each other.
- Each Ijaw word must be distinct — no synonyms or near-synonyms.
- The "dialect" field in every entry must be exactly: "${dialect}"
- Do not include loanwords from English, Pidgin, or Yoruba unless they are fully nativised in ${dialect}.
- Prefer concrete, verifiable words over abstract ones, especially for easy difficulty.

GENERATION SEED (for variety): ${userSeed}

Return a JSON array of exactly ${count} objects.`;

  const response = await withKeyRotation(client =>
    client.models.generateContent({
      model: TEXT_MODEL,
      contents: schemaPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              meaning: { type: Type.STRING },
              pronunciation: { type: Type.STRING },
              dialect: { type: Type.STRING },
            },
            required: ["word", "meaning", "pronunciation", "dialect"],
          },
        },
      },
    })
  );

  try {
    const parsed: IjawWord[] = JSON.parse(response.text ?? '[]');
    const seen = new Set<string>();
    return parsed.filter(w => {
      const key = w.meaning.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    console.error("Failed to parse Gemini word response:", error);
    return [];
  }
}

// ─── Sentence generation ─────────────────────────────────────────────────────

export async function generateIjawSentences(
  dialect: string,
  count: number = 3,
  difficulty: DifficultyLevel = 'easy'
): Promise<IjawSentence[]> {
  const prompt = `You are an expert linguist and native speaker of the ${dialect} dialect of the Ijaw language group from the Niger Delta region of Nigeria.

${IJAW_LANGUAGE_MASTER_CONTEXT}

PHONOLOGY REFERENCE:
${IJAW_PHONOLOGY_GUIDE}

TASK: Generate exactly ${count} full sentences or common phrases in the ${dialect} Ijaw dialect.

DIFFICULTY: ${difficulty.toUpperCase()}
${DIFFICULTY_GUIDELINES[difficulty]}

SENTENCE-SPECIFIC RULES:
- Sentences must be practically useful — greetings, requests, statements about daily life, market phrases, or expressions of emotion.
- Each sentence must have a completely different communicative purpose from the others (e.g., do not give 3 greeting sentences).
- Keep sentences natural and idiomatic — avoid word-for-word translations from English.
- The "sentence" field must contain the full Ijaw sentence.
- The "meaning" field must contain the full natural English translation.
- The "pronunciation" field must give a word-by-word phonetic guide to the full sentence.
- The "dialect" field in every entry must be exactly: "${dialect}"

Return a JSON array of exactly ${count} objects.`;

  const response = await withKeyRotation(client =>
    client.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sentence: { type: Type.STRING },
              meaning: { type: Type.STRING },
              pronunciation: { type: Type.STRING },
              dialect: { type: Type.STRING },
            },
            required: ["sentence", "meaning", "pronunciation", "dialect"],
          },
        },
      },
    })
  );

  try {
    return JSON.parse(response.text ?? '[]');
  } catch (error) {
    console.error("Failed to parse Gemini sentence response:", error);
    return [];
  }
}

// ─── Word verification ───────────────────────────────────────────────────────

export async function verifyIjawWord(
  word: string,
  meaning: string,
  dialect: string
): Promise<{ isCorrect: boolean; correction?: string; reason?: string }> {
  const groundedPrompt = `You are an expert linguist specialising in the ${dialect} dialect of the Ijaw language from Nigeria's Niger Delta.

${IJAW_LANGUAGE_MASTER_CONTEXT}

TASK: Verify whether the Ijaw word or phrase "${word}" in the ${dialect} dialect correctly translates to the English meaning: "${meaning}".

Search for documentation of this word online and in linguistic databases before answering.

VERIFICATION RULES:
1. Check if the spelling follows the standardised orthography for ${dialect} Ijaw.
2. Check if the meaning is accurate and complete.
3. Check if this is a genuine word in ${dialect} Ijaw, not a loan word or word from another dialect.
4. If the word exists but has a slightly different canonical spelling in ${dialect}, note the correct spelling.
5. If the meaning is partially correct but incomplete, set isCorrect to false and provide the full correct meaning in "correction".

Be strict — only set isCorrect to true if you are highly confident the word and meaning are both correct for ${dialect} Ijaw.

Return ONLY a JSON object, no markdown, no explanation:
{"isCorrect": true/false, "correction": "...", "reason": "..."}`;

  try {
    const groundedResponse = await withKeyRotation(client =>
      client.models.generateContent({
        model: TEXT_MODEL,
        contents: groundedPrompt,
        config: { tools: [{ googleSearch: {} }] },
      })
    );

    const rawText = groundedResponse.text?.trim() ?? '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.isCorrect === 'boolean') return parsed;
    }
  } catch (groundedError) {
    console.warn("Grounded verification failed, falling back to schema approach:", groundedError);
  }

  // Schema fallback
  const schemaPrompt = `You are an expert linguist specialising in the ${dialect} dialect of the Ijaw language from Nigeria's Niger Delta.

${IJAW_LANGUAGE_MASTER_CONTEXT}

TASK: Verify whether the Ijaw word or phrase "${word}" in the ${dialect} dialect correctly translates to the English meaning: "${meaning}".

VERIFICATION RULES:
1. Check if the spelling follows the standardised orthography for ${dialect} Ijaw.
2. Check if the meaning is accurate and complete.
3. Check if this is a genuine word in ${dialect} Ijaw, not a loan word or word from another dialect.
4. If the word exists but has a slightly different canonical spelling in ${dialect}, note the correct spelling.
5. If the meaning is partially correct but incomplete, set isCorrect to false and provide the full correct meaning in "correction".

Be strict — only set isCorrect to true if you are highly confident the word and meaning are both correct for ${dialect} Ijaw.`;

  const response = await withKeyRotation(client =>
    client.models.generateContent({
      model: TEXT_MODEL,
      contents: schemaPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isCorrect: { type: Type.BOOLEAN },
            correction: { type: Type.STRING },
            reason: { type: Type.STRING },
          },
          required: ["isCorrect"],
        },
      },
    })
  );

  try {
    return JSON.parse(response.text ?? '{"isCorrect":false}');
  } catch (error) {
    console.error("Failed to parse Gemini verification response:", error);
    return { isCorrect: false, reason: "Verification failed" };
  }
}

// ─── English phrase generation ───────────────────────────────────────────────

export async function generateEnglishPhrase(): Promise<string> {
  const categories = [
    'a simple greeting or farewell',
    'asking for directions or location',
    'expressing hunger, thirst, or tiredness',
    'a market or trading phrase',
    'a family or relationship statement',
    "asking someone's name or origin",
    'expressing gratitude or apology',
    'a weather or nature observation',
    'a daily activity statement (eating, working, sleeping)',
    'expressing agreement or disagreement',
  ];
  const category = categories[Math.floor(Math.random() * categories.length)];

  const response = await withKeyRotation(client =>
    client.models.generateContent({
      model: TEXT_MODEL,
      contents: `Generate a single, short, natural English phrase or sentence in the category of: ${category}.

Rules:
- Must be 3-10 words long.
- Must be practical and useful for everyday conversation.
- Must be at a beginner-to-intermediate language level.
- Return ONLY the phrase itself — no quotes, no explanation, no punctuation at the end unless it is a question.`,
    })
  );

  return (response.text ?? '').trim().replace(/^["']|["']$/g, '').replace(/[.!]$/, '');
}

// ─── TTS ─────────────────────────────────────────────────────────────────────

export async function generateSpeech(text: string): Promise<string> {
  const cleanText = text.replace(/[*_`#]/g, '').trim();
  if (!cleanText) throw new Error("Speech text is empty");

  try {
    const response = await withKeyRotation(client =>
      client.models.generateContent({
        model: TTS_MODEL,
        contents: [{ role: 'user', parts: [{ text: cleanText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
        },
      })
    );

    const candidates = response.candidates;
    console.debug('[TTS] candidates count:', candidates?.length);
    console.debug('[TTS] first candidate parts:',
      JSON.stringify(candidates?.[0]?.content?.parts?.map(p => ({
        hasInlineData: !!p.inlineData,
        mimeType: p.inlineData?.mimeType,
        dataLength: p.inlineData?.data?.length,
      })))
    );

    const audioPart = candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
    if (audioPart?.inlineData?.data) return audioPart.inlineData.data;

    const textPart = candidates?.[0]?.content?.parts?.find(p => p.text);
    console.debug('[TTS] text fallback:', textPart?.text?.slice(0, 100));

    throw new Error("No audio data returned from the TTS model.");
  } catch (error: any) {
    console.error(`[TTS] Speech generation failed:`, error);

    if (error?.message?.includes('500') || error?.status === 500) {
      throw new Error("The speech generation service is temporarily unavailable. Please try again.");
    }

    throw new Error(`Failed to generate speech: ${error?.message ?? "Unknown error"}`);
  }
}

// ─── Diagnostics (useful in dev) ─────────────────────────────────────────────

/** Returns how many keys are loaded and which index is active. */
export const geminiKeyStatus = () => ({
  total: KEY_POOL.length,
  active: _keyIndex + 1,
  model: TEXT_MODEL,
  ttsModel: TTS_MODEL,
});
