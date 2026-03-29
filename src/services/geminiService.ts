import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

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

export async function generateIjawWords(dialect: string, count: number = 5, difficulty: DifficultyLevel = 'easy'): Promise<IjawWord[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate ${count} random words in the Ijaw dialect: ${dialect}. 
    Difficulty level: ${difficulty}. 
    Include the word, its meaning in English, and a phonetic pronunciation guide. 
    Return the result as a JSON array of objects with properties: word, meaning, pronunciation, dialect.`,
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
            dialect: { type: Type.STRING }
          },
          required: ["word", "meaning", "pronunciation", "dialect"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Failed to parse Gemini response:", error);
    return [];
  }
}

export async function generateIjawSentences(dialect: string, count: number = 3, difficulty: DifficultyLevel = 'easy'): Promise<IjawSentence[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate ${count} random full sentences in the Ijaw dialect: ${dialect}. 
    Difficulty level: ${difficulty}. 
    Include the sentence, its meaning in English, and a phonetic pronunciation guide. 
    Return the result as a JSON array of objects with properties: sentence, meaning, pronunciation, dialect.`,
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
            dialect: { type: Type.STRING }
          },
          required: ["sentence", "meaning", "pronunciation", "dialect"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Failed to parse Gemini sentence response:", error);
    return [];
  }
}

export async function verifyIjawWord(word: string, meaning: string, dialect: string): Promise<{ isCorrect: boolean; correction?: string; reason?: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Verify if the word "${word}" in the Ijaw dialect "${dialect}" correctly means "${meaning}". 
    If incorrect, provide the correct meaning and a brief reason. 
    Return the result as a JSON object with properties: isCorrect (boolean), correction (string, optional), reason (string, optional).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isCorrect: { type: Type.BOOLEAN },
          correction: { type: Type.STRING },
          reason: { type: Type.STRING }
        },
        required: ["isCorrect"]
      }
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Failed to parse Gemini verification response:", error);
    return { isCorrect: false, reason: "Verification failed" };
  }
}

export async function generateEnglishPhrase(): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: "Generate a simple, common English phrase or short sentence that would be useful to translate into another language (e.g., 'Where is the nearest market?', 'I am hungry', 'What is your name?'). Return ONLY the phrase text, no quotes, no preamble, no explanation.",
  });
  return response.text.trim().replace(/^["']|["']$/g, '');
}

export async function generateSpeech(text: string): Promise<string> {
  const cleanText = text.replace(/[*_`#]/g, '').trim();
  if (!cleanText) throw new Error("Speech text is empty");

  // gemini-2.5-flash-preview-tts is the specialized model for high-quality speech
  const modelName = "gemini-2.5-flash-preview-tts";
  
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      // Prefixing with "Say: " can help the model understand the context better
      contents: [{ parts: [{ text: `Say: ${cleanText}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            // Trying 'Zephyr' as an alternative to 'Kore'
            prebuiltVoiceConfig: { voiceName: 'Zephyr' },
          },
        },
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
    if (audioPart?.inlineData?.data) {
      return audioPart.inlineData.data;
    }

    throw new Error("No audio data returned from the model.");
  } catch (error: any) {
    console.error(`Speech generation failed with model ${modelName}:`, error);
    
    // Detailed error logging for 500 errors
    if (error?.message?.includes('500') || error?.status === 500) {
      throw new Error("The speech generation service is currently experiencing an internal error (500). This is usually a temporary issue with the Gemini TTS service. Please try again in a few seconds.");
    }
    
    throw new Error(`Failed to generate speech: ${error?.message || "Unknown error"}`);
  }
}
