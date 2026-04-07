// ============================================================
// IJAW LANGUAGE MASTER CONTEXT
// Authoritative linguistic context injected into every AI call
// ============================================================

export const DIALECT_PROFILES: Record<string, string> = {
  Kolokuma:
    "The most widely documented and academically studied dialect of Izon, spoken around the Kolokuma-Opokuma LGA of Bayelsa State. It is the de facto prestige dialect used in most formal linguistic descriptions, Bible translations (e.g., the 1979 Izon New Testament), and SIL reference works. Phonologically, it is characterised by a relatively stable vowel harmony system and straightforward tonal contrasts. It is sometimes called 'Standard Izon' in academic literature.",
  Nembe:
    "Spoken in Nembe and Brass LGAs of Bayelsa State, Nembe has a distinctly conservative phonological profile and is considered one of the most archaic dialects. It preserves historical sound contrasts that other dialects have merged. Nembe speakers have a rich oral tradition including war songs and maritime vocabulary. The dialect differs sufficiently from Kolokuma that mutual intelligibility is partial. It has its own literary tradition, including the poetry of Ebiegberi Joe Alagoa.",
  Brass:
    "Closely related to Nembe; sometimes grouped with it as the 'Eastern' branch. Brass (Twon-Brass) is spoken at the historic trading port of Brass on the Atlantic coast. Significant contact with English and Portuguese during the slave trade era introduced loan vocabulary, but core Ijaw roots remain intact. The dialect features distinct intonation contours in declarative sentences.",
  Ekpetiama:
    "Spoken in Ekpetiama LGA, Bayelsa State. One of the mid-range dialects, moderately close to Kolokuma but with perceptible vowel quality differences. Ekpetiama communities are known for their masquerade traditions (Egbesu worship). The dialect preserves older kinship terminology that has been lost in Kolokuma.",
  Tarakiri:
    "A Delta State dialect spoken around Bomadi LGA. Tarakiri occupies a transitional position between the Western and Central Izon dialects. It has borrowed more vocabulary from neighbouring Urhobo and Isoko than other Izon dialects, though core grammar remains Ijaw. Tonal system is four-way: High, Mid, Low, and Downstepped-High.",
  Oporoza:
    "Spoken in the Gbaramatu Kingdom (Warri South-West LGA, Delta State). Oporoza is the language of the Ijaw oil-producing communities who have been at the forefront of Niger Delta activism. The dialect has significant internal variation between coastal fishing communities and inland agricultural settlements. Vocabulary for oil-related concepts is extensively borrowed from English.",
  Olodiama:
    "A lesser-documented western dialect spoken in parts of Delta State and Edo State. Olodiama sits at the geographical periphery of the Ijaw-speaking area and has significant lexical influence from Itsekiri. It preserves a three-way nominal tone distinction that some central dialects have reduced to two.",
  Gbarain:
    "Spoken in Yenagoa LGA and surrounds, very close to the state capital of Bayelsa. Due to urbanisation, Gbarain has undergone significant levelling and code-switching with Nigerian Pidgin English. Younger speakers often mix Gbarain with Pidgin in casual speech. Traditional forms, however, preserve classical Ijaw grammatical structures.",
  Mein:
    "Spoken in Sagbama LGA, Bayelsa State. Mein is known for its elaborate system of honorific address forms used for elders and chiefs. The verb serialisation patterns in Mein are especially complex and have been the subject of academic study. Mein speakers maintain strong oral poetry traditions related to fishing and river spirits.",
  Boma:
    "A Northern Ijaw dialect spoken in Rivers State, particularly around Ahoada. Boma has closer contact with Ogoni, Ekpeye, and other Rivers State languages than most Ijaw dialects, resulting in some areal features. The nominal class system in Boma shows partial grammaticalisation of definiteness.",
  Kumbo:
    "Spoken in the Sagbama area, related to Mein. Kumbo is among the smaller dialect communities and is considered vulnerable. Documentation efforts by SIL International in the 2000s produced wordlists and grammatical sketches. Phonological inventory is similar to Kolokuma but with vowel quality differences in mid-vowels.",
  Buseni:
    "A small dialect community related to Boma, spoken in Rivers State. Buseni has limited documentation. It shares grammatical features with both the Boma cluster and Eastern Ijaw dialects. It is at risk of language shift due to the dominance of Nigerian Pidgin in the region.",
  Okordia:
    "Spoken in Yenagoa and Ogbia LGAs. Okordia is phonologically distinct in that it has a greater number of nasal vowel phonemes than most other Ijaw dialects. The oral literature of Okordia communities includes elaborate creation myths tied to Woyingi (the Supreme Creator deity). The dialect is used in some local government radio broadcasts.",
  Zarama:
    "A lesser-documented dialect spoken in parts of Bayelsa and Rivers States. Zarama is linguistically conservative, preserving grammatical gender distinctions (animate/inanimate) in pronouns that most Izon dialects have lost. It is spoken by communities involved in freshwater fishing and subsistence farming.",
  Akita:
    "Spoken in Sagbama LGA. Akita is phonologically notable for its realisation of the mid-central vowel /ə/ which appears in unstressed syllables — a feature not shared by all Ijaw dialects. Very limited formal documentation exists. Communities are predominantly fishing villages along the Forcados River tributaries.",
  Kabowei:
    "Spoken in Sagbama LGA, closely related to Mein and Kumbo. Kabowei is among the most endangered dialect clusters in the Izon group, with intergenerational transmission declining. Linguists from the Endangered Languages Project have conducted fieldwork here. Tonal system includes a distinctive rising-falling contour on emphatic predicates.",
};

export const IJAW_PHONOLOGY_GUIDE = `
======================================================
IJAW (IZON) PHONOLOGICAL SYSTEM — REFERENCE GUIDE
======================================================

TONE SYSTEM
-----------
Izon is a tonal language. Tone is lexically contrastive: the same segmental string with different tones has different meanings.

Tone levels recognised in the scholarly literature:
  H  = High tone          (e.g., marked with acute accent: á)
  L  = Low tone           (e.g., marked with grave accent: à)
  M  = Mid tone           (used in some dialects as a third level; found notably in Tarakiri)
  HL = Falling tone       (High-to-Low contour on a single syllable; can be marked with circumflex: â)
  LH = Rising tone        (Low-to-High contour; rarer, found in some Eastern dialects)
  !H = Downstepped High   (a High tone that is phonetically lower than a preceding High; symbolised with !)

Phonological rules:
  - Tonal spreading: In verb-object constructions, the verb tone can spread rightward.
  - Downstep: A sequence H !H L is common in many dialects.
  - Floating tones: Some morphemes contribute tone but no segmental content.

VOWEL INVENTORY
---------------
Izon has a 7-vowel system (ATR-based harmony in many dialects):

  +ATR vowels: i   e   o   u
  -ATR vowels: ɪ   ɛ   ɔ
  Low vowel:   a   (participates in both harmony classes contextually)

Vowel harmony: Roots are categorised as +ATR or -ATR; affixes harmonise with the root.
  +ATR example: /bi/ (he/she), /fene/ (to swim)
  -ATR example: /bɪ/ (to enter), /fɛnɛ/ (some dialects)

Nasalisation:
  Oral vowels are the default. Nasal vowels are phonemic in some dialects (especially Okordia).
  Nasalisation spreads leftward from nasal consonants in many dialects.
  Nasalised vowels are written with a tilde: ã, ẽ, ĩ, õ, ũ.

Long vowels:
  Vowel length is phonemically contrastive in several dialects.
  Long vowels are written doubled: aa, ee, ii, oo, uu.

CONSONANT INVENTORY
-------------------
Labials:  p  b  f  v  m  (kp  gb — labio-velar stops, highly characteristic of Niger-Congo)
Dentals:  t  d  s  z  n  l  r
Velars:   k  g  (ŋ — velar nasal)
Palatals: tʃ  dʒ  (some dialects use these; others use palatalized stops)
Laryngeal: h  (glottal fricative, used in some dialects)

The labio-velars /kp/ and /gb/ are phonemically distinct from sequences /k+p/ and /g+b/.
  Example: /kpɔ/ "river" (Kolokuma) vs. theoretical sequence /kopɔ/.

SYLLABLE STRUCTURE
------------------
  Dominant patterns: CV, CVV (with long vowel), CVC (rare, mainly in loan words)
  Izon words are predominantly open-syllable.
  Consonant clusters are generally not permitted at syllable onset.

ORTHOGRAPHIC CONVENTIONS
------------------------
  - The standardised orthography approved by the Bayelsa State government and used in SIL materials
    uses the following extended characters: ɛ  ɔ  ŋ  (sometimes written as e' o' n' in informal texts)
  - Tone marks are REQUIRED in any reference material but are often omitted in everyday writing.
  - The letter 'y' represents a palatal glide /j/.
  - The letter 'w' represents a labio-velar glide /w/.
  - Double letters indicate vowel length (not geminate consonants).
  - The digraph 'gh' represents the voiced velar fricative /ɣ/ in some dialects.
  - The digraph 'kp' and 'gb' are always written as digraphs, never split.

WORD CLASSES AND MORPHOLOGICAL NOTES
--------------------------------------
  Nouns:
    - Number: Plurality is often marked by reduplication or by numeral phrases.
      Singular: /biri/  (child)
      Plural:   /biri-biri/ or contextual (no obligatory plural morpheme).
    - Possession: Possessor precedes possessee.
      Example: /mi ari/ = "my head" (mi = 1SG pronoun, ari = head)
    - No grammatical gender, but animate/inanimate distinction surfaces in some pronouns.

  Verbs:
    - Verb serialisation is a defining grammatical feature of Izon.
      Serial verb constructions (SVCs) string multiple verbs together without conjunctions.
      Example: "He took the fish and went to the market" is expressed as a single clause
               with the verbs "take", "go", "reach" serialised.
    - Aspect marking: Izon primarily encodes aspect (completive vs. incompletive) rather than tense.
    - Negation: Pre-verbal negation particle (varies by dialect; common forms: /ke/, /kẹ/).

  Pronouns (Kolokuma reference):
    1SG: mi     2SG: wo     3SG: be/bi
    1PL: mia    2PL: muo    3PL: timi
`;

export const GENERATION_EXAMPLES: Record<'easy' | 'medium' | 'hard', Array<{ ijaw: string; english: string; dialect: string; note?: string }>> = {
  easy: [
    { ijaw: "ari", english: "head", dialect: "Kolokuma", note: "Body part — one of the most documented Izon words" },
    { ijaw: "bein", english: "hand / arm", dialect: "Kolokuma" },
    { ijaw: "iyain", english: "eye", dialect: "Kolokuma" },
    { ijaw: "toru", english: "water / river", dialect: "Kolokuma", note: "Also means 'creek'" },
    { ijaw: "ibe", english: "fish", dialect: "Kolokuma", note: "Central to Ijaw subsistence" },
    { ijaw: "biri", english: "child", dialect: "Kolokuma" },
    { ijaw: "aku", english: "fire", dialect: "Kolokuma" },
    { ijaw: "keme", english: "canoe / boat", dialect: "Kolokuma", note: "Core to Niger Delta life" },
    { ijaw: "mi", english: "I / me (first person singular pronoun)", dialect: "Kolokuma" },
    { ijaw: "be", english: "he / she (third person singular)", dialect: "Kolokuma" },
    { ijaw: "ighi", english: "one", dialect: "Kolokuma" },
    { ijaw: "ari", english: "head", dialect: "Nembe", note: "Same root as Kolokuma with slight tonal shift" },
    { ijaw: "kala", english: "good / beautiful", dialect: "Kolokuma" },
    { ijaw: "aye", english: "mother", dialect: "Kolokuma" },
    { ijaw: "opu", english: "father", dialect: "Kolokuma" },
  ],
  medium: [
    { ijaw: "fene", english: "to swim", dialect: "Kolokuma", note: "Core verb for fishing communities" },
    { ijaw: "tibi", english: "to cook", dialect: "Kolokuma" },
    { ijaw: "seki", english: "market", dialect: "Kolokuma", note: "Trade vocabulary" },
    { ijaw: "oyinbo", english: "foreigner / European", dialect: "Kolokuma", note: "Historical contact term — fully nativised" },
    { ijaw: "amayanabo", english: "paramount ruler / king", dialect: "Kolokuma", note: "Important political title" },
    { ijaw: "ekereme", english: "morning", dialect: "Kolokuma", note: "Time expression" },
    { ijaw: "bou", english: "night / darkness", dialect: "Kolokuma" },
    { ijaw: "doru", english: "to know / to understand", dialect: "Kolokuma" },
    { ijaw: "gbein", english: "to come", dialect: "Kolokuma" },
    { ijaw: "bara", english: "town / community", dialect: "Kolokuma", note: "Social organisation vocabulary" },
    { ijaw: "owei", english: "man / male", dialect: "Kolokuma" },
    { ijaw: "iyala", english: "woman / female", dialect: "Kolokuma" },
  ],
  hard: [
    { ijaw: "Woyingi", english: "Supreme Creator deity in Ijaw cosmology", dialect: "Kolokuma", note: "Spiritual/ceremonial term" },
    { ijaw: "Egbesu", english: "deity of justice and warfare", dialect: "Kolokuma", note: "Ceremonial/ritual term" },
    { ijaw: "owuamapu", english: "masquerade spirit that comes at funerals", dialect: "Kolokuma", note: "Ritual vocabulary" },
    { ijaw: "alagba", english: "elder / respected community leader", dialect: "Kolokuma", note: "Honorific" },
    { ijaw: "erekowei", english: "to speak with authority / to pronounce judgment", dialect: "Kolokuma", note: "Legal/ceremonial vocabulary" },
    { ijaw: "izon ogbo", english: "the Ijaw custom / Ijaw tradition", dialect: "Kolokuma", note: "Abstract cultural concept" },
    { ijaw: "ereme", english: "mangrove swamp forest", dialect: "Kolokuma", note: "Environment-specific terminology" },
    { ijaw: "bou-toru", english: "dry season (literally: the water sleeps)", dialect: "Kolokuma", note: "Compound word, seasonal vocabulary" },
    { ijaw: "funmie", english: "to paddle against the current", dialect: "Kolokuma", note: "Fishing/navigation vocabulary" },
    { ijaw: "seigbein", english: "ancestral land rights ceremony", dialect: "Kolokuma", note: "Ritual land tenure term" },
  ],
};

export const IJAW_LANGUAGE_MASTER_CONTEXT = `
=============================================================================
IJAW (IZON) LANGUAGE — AUTHORITATIVE LINGUISTIC CONTEXT FOR AI GENERATION
=============================================================================

OVERVIEW
--------
The Ijaw language, also called Izon (and sometimes spelled Ijo), is a group of closely related
dialects spoken primarily in the Niger Delta region of Nigeria, particularly in Bayelsa State,
Delta State, Rivers State, and parts of Edo State and Ondo State.

Speaker population: Approximately 2 million speakers (Ethnologue, 22nd edition; SIL International
2019 estimates). This makes Izon one of Nigeria's top-ten most widely spoken indigenous languages,
though it is considered "vulnerable" by UNESCO's Atlas of the World's Languages in Danger due to
pressure from Nigerian Pidgin English and English in formal domains.

Genetic classification:
  Niger-Congo → Atlantic-Congo → Ijoid (sometimes listed as an early branch)
  Izon is classified as an ISOLATE within Niger-Congo by some authorities; it is the sole
  member of the Ijoid sub-group that has no demonstrated sister language within the family.

Geographic distribution:
  The Niger Delta is one of the world's largest river deltas, characterised by intricate creek
  systems, mangrove forests, and coastal fishing communities. This environment has profoundly
  shaped the Ijaw lexicon: they have highly specific vocabulary for different types of watercraft,
  fishing techniques, fish species, tidal patterns, and water spirits.

DIALECTS — ALL 16
-----------------
${Object.entries(DIALECT_PROFILES).map(([name, desc]) => `${name}:\n  ${desc}`).join('\n\n')}

PHONOLOGICAL SYSTEM
-------------------
${IJAW_PHONOLOGY_GUIDE.trim()}

MORPHOLOGICAL PATTERNS
-----------------------

1. VERB SERIALISATION (most distinctive feature):
   Izon uses Serial Verb Constructions (SVCs) extensively. Multiple verbs share a single subject
   and are juxtaposed without conjunctions.
   Pattern: S V1 O1 V2 O2 (V3 O3...)
   Example (Kolokuma):
     "Be ibe gba seki kẹ gbein" = He fish take market to come
     = "He brought fish from the market."

2. NOUN CLASS SYSTEM:
   Unlike Bantu, Izon does NOT have an elaborate noun class system with agreement morphology.
   However, there is a semantic distinction between animate and inanimate nouns that surfaces in
   third-person pronoun choice in some dialects (Zarama preserves this most clearly).

3. POSSESSIVE CONSTRUCTIONS:
   Possessor + Possessee order (unlike English):
   /mi toru/ = my water = "my river" (mi = 1SG, toru = water)
   /opu bara/ = father's town = "the father's village"
   No possessive morpheme is used; juxtaposition alone signals possession.

4. PLURAL FORMATION:
   No mandatory plural suffix. Plurality is often unmarked or indicated by:
   a) Numeral: /biri kiri/ = children-two = "two children"
   b) Full reduplication: /biri biri/ = many children (colloquial, not all dialects)
   c) Context (bare form interpreted as generic/plural in appropriate context)

5. ASPECT SYSTEM:
   Izon is aspectually (not tense) primary:
   - COMPLETIVE aspect: Often unmarked or marked by post-verbal particle
   - INCOMPLETIVE/HABITUAL: Pre-verbal or post-verbal aspect particle (varies by dialect)
   - PROGRESSIVE: Reduplication of verb stem in some dialects

6. NEGATION:
   Pre-verbal negation is typical. Common particles: /ke/ (Kolokuma), /kẹ/ (some dialects).
   Double negation is possible in some dialects for emphasis.

TONAL ORTHOGRAPHY CONVENTIONS
------------------------------
When writing Izon with tone marks for academic or reference purposes:
  - Acute accent (´) = High tone: á, é, í, ó, ú
  - Grave accent (\`) = Low tone: à, è, ì, ò, ù
  - Macron (¯) = Mid tone: ā, ē, ī, ō, ū (used in dialects with three-level tone)
  - Circumflex (^) = Falling tone (HL contour): â, ê, î, ô, û
  - Caron (ˇ) = Rising tone (LH contour): ǎ, ě, ǐ, ǒ, ǔ (rare, Eastern dialects)
When tone marks are omitted (informal writing), context disambiguates tone in most cases.
For AI generation purposes: ALWAYS include pronunciation guides using H/L/M notation.

COMMON WORD CATEGORIES FOR LANGUAGE DOCUMENTATION
----------------------------------------------------
Priority vocabulary domains (in order of documentation importance):

1. BODY PARTS: Head, eye, ear, nose, mouth, teeth, tongue, neck, shoulder, arm, hand, finger,
   chest, belly, back, leg, foot, toe, skin, hair, heart, liver.

2. NUMBERS 1–20: ighi (1), ari (2), tabo (3), eni (4), mein (5)... (Kolokuma reference).
   Note: number systems sometimes show traces of base-10 and base-5 counting.

3. KINSHIP TERMS: Father, mother, elder sibling, younger sibling, grandfather, grandmother,
   uncle (father's brother vs. mother's brother are typically distinct in Izon), aunt,
   first child (special term in many dialects), co-wife (polygamous household term).

4. NATURE/ENVIRONMENT: Earth/soil, forest, sun, moon, star, rain, wind, mountain, tree, bird, snake, crocodile, water/river (toru), fish (ibe).

5. VERBS OF MOTION: Go, come, run, walk, carry, bring, return, enter, exit, jump, climb, swim, paddle.

6. TIME EXPRESSIONS: Morning, afternoon, evening, night, today, yesterday, tomorrow, week,
   month, year, dry season, rainy season, sunrise, sunset, old age, youth.

7. TRADE AND SOCIAL VOCABULARY: Buy, sell, barter, price, profit, market, community, 
   leadership, justice, peace, war, marriage, birth, inheritance.

8. GREETINGS AND DISCOURSE MARKERS: Hello (varies by time of day), goodbye, thank you,
   yes, no, please, sorry, welcome, how are you, I am fine.

CULTURAL CONTEXT
----------------

FISHING COMMUNITIES:
  The Ijaw are historically and culturally fishermen. This shapes vocabulary at every level:
  - Dozens of words for different fishing techniques (trap fishing, net fishing, hook fishing,
    poison fishing in stagnant pools)
  - Specific terms for types of watercraft: small dugout canoe, large war canoe, trading canoe
  - Seasonal vocabulary tied to fish migration and tidal cycles
  - Fish species names (often have no English equivalents — use scientific names if necessary)

NIGER DELTA ENVIRONMENT:
  - The physical landscape creates vocabulary: creek, mangrove, swamp forest, tidal flat,
    river island (peribo), flood season
  - Oil extraction has brought new vocabulary, mostly borrowed from English
  - Traditional land rights are tied to community identity (bara = town/community is central)

MASQUERADE TRADITION:
  Masquerades (called by various names across dialects) are central to Ijaw spiritual and
  social life. They represent ancestral spirits and deities. Vocabulary in this domain is
  sacred and some words are restricted (only initiates may use them). Key public terms:
  - Egbesu (deity of justice and war)
  - Woyingi or Tamuno (Supreme Creator)
  - Owuamapu, Sekiapu (types of masquerades)
  - Owu (generic term for water spirits that manifest as masquerades)

NAMING CONVENTIONS:
  Ijaw names are often complete sentences or phrases with meanings. Examples:
  - Peremobowei = "who knows the story" (rhetorical philosophical name)
  - Douye = "only God knows" (theophoric)
  - Tarila = "things will be fine" (auspicious)
  - Names often reference birth order, circumstances, or hopes.

PROVERBS AND ORAL LITERATURE:
  Izon proverbs are typically short, dense, and heavily reliant on tonal differentiation.
  Many reference fishing, water, or the Niger Delta environment. Academic collections exist
  (notably by Ebiegberi Joe Alagoa for Nembe and the Rivers State oral traditions project).

CRITICAL AUTHENTICITY RULES
-----------------------------

RULE 1 — DO NOT CONFUSE DIALECTS:
  Each dialect is a distinct linguistic variety. A word attested only in Nembe should NOT
  be presented as a Kolokuma word, and vice versa. When uncertain, choose words documented
  in widely available sources (Kolokuma has the most documentation).

RULE 2 — DO NOT USE NIGERIAN PIDGIN WORDS:
  Nigerian Pidgin (Naijá) is a separate creole language widely spoken in the Niger Delta.
  Words like "wetin" (what), "abeg" (please), "na" (it is), "oga" (boss), "wahala" (trouble)
  are Pidgin, NOT Ijaw. NEVER present Pidgin vocabulary as Ijaw vocabulary.

RULE 3 — DO NOT USE UNASSIMILATED YORUBA OR IGBO BORROWINGS:
  Some Nigerian languages have borrowed words from each other. Do not present Yoruba words
  (e.g., "owo" = money in Yoruba) or Igbo words as Izon words, unless they have been
  fully phonologically nativised and documented in Izon literature.

RULE 4 — SPELLING CONSISTENCY:
  Use the academically documented spelling for each word. Do not invent alternative spellings.
  The SIL International wordlists and the Summer Institute of Linguistics Izon-English dictionary
  (various editions) are the primary orthographic references.

RULE 5 — TONAL CORRECTNESS:
  In a tonal language, a word with the wrong tones is a DIFFERENT WORD or a non-word.
  When providing pronunciation guides, always specify tones.

RULE 6 — NO INVENTED VOCABULARY:
  Do not generate words that do not exist in any documented Izon dialect. If you are not
  confident that a word exists with the given meaning, choose a different word you can verify.

WHAT MAKES A BAD ENTRY
------------------------

The following would be REJECTED by human vettors:

BAD EXAMPLE 1: Invented word
  Word: "toburi", Meaning: "happiness", Dialect: Kolokuma
  Problem: This word is not attested in any Kolokuma documentation. "Toburi" sounds
  superficially plausible but is fabricated.

BAD EXAMPLE 2: Nigerian Pidgin word presented as Izon
  Word: "wahala", Meaning: "trouble / problem", Dialect: Nembe
  Problem: "Wahala" is a Hausa word adopted into Nigerian Pidgin. It is used colloquially
  in all parts of Nigeria but it is NOT an Ijaw word.

BAD EXAMPLE 3: Wrong dialect attribution
  Word: "ọkọ", Meaning: "boat", Dialect: Kolokuma
  Problem: "ọkọ" is a Yoruba word for "husband" or a Yoruba term with unrelated meaning.
  The Kolokuma word for canoe/boat is "keme".

BAD EXAMPLE 4: Inconsistent spelling
  Word: "beri" vs "biri" (child), Dialect: Kolokuma
  Problem: The documented Kolokuma form is "biri". Presenting "beri" introduces a false variant.

BAD EXAMPLE 5: Using a related language's word
  Word: "edo", Meaning: "town", Dialect: Ekpetiama
  Problem: "Edo" is from the Edo/Bini language. Though Ekpetiama has some Edo contact, this
  specific term has not been documented as a nativised Izon word.

ACADEMIC AND WEB SOURCES FOR AI MENTAL REFERENCE
--------------------------------------------------

The following sources should be used as mental anchors when generating or verifying Izon vocabulary:

1. Williamson, K. (1965). "A Grammar of the Kolokuma Dialect of Ijo."
   West African Language Monographs 2. Cambridge University Press.
   — The foundational modern descriptive grammar. All Kolokuma data should be cross-checked
     against this work.

2. SIL International Izon (Izo) language data (ISO 639-3 code: ijc for Ijaw / ije for Ekpeye).
   Available via the SIL Language and Culture Archives and the Endangered Languages Project.

3. Alagoa, E.J. (1964, 1972). Nembe oral traditions. University of Ibadan Press.
   — Primary source for Nembe dialect vocabulary and proverbs.

4. UNESCO Atlas of the World's Languages in Danger: Ijaw entry.

5. Ethnologue entry for Izon (Ijaw): https://www.ethnologue.com/language/ijc/
   — Speaker population data, geographic distribution, dialect groupings.

6. The Endangered Languages Project: Izon documentation.
   https://www.endangeredlanguages.com/lang/1924

7. WALS (World Atlas of Language Structures) entries for Izon properties.

8. Nigeria Bible Translation Trust (NBTT) Izon New Testament (1979, revised 2003) —
   Contains a substantial standardised Kolokuma/Izon vocabulary.

9. Bayelsa State Ministry of Education: Izon Language Curriculum (2015).
   — Orthographic standards used in formal education.

10. Jenewari, C.E.W. (1983). "Defaka, Ijo's Closest Linguistic Relative." In Dihoff (ed.)
    Current Approaches to African Linguistics. Vol. 1. — Genetic classification context.

GENERATION QUALITY CHECKLIST (run through this before returning any output)
-----------------------------------------------------------------------------
For each generated word or phrase:
  [ ] Is this word documented in at least one published or academic source?
  [ ] Is the spelling consistent with the standardised orthography for this dialect?
  [ ] Is the meaning accurate and specific (not vague)?
  [ ] Is the pronunciation guide using correct Izon phonological notation?
  [ ] Does the "dialect" field match exactly the requested dialect?
  [ ] Is there any chance this word is from Nigerian Pidgin, Yoruba, or Igbo? (reject if yes)
  [ ] Does the word belong to the requested difficulty level?
  [ ] Is the English meaning 1-5 words (for single words) or one sentence (for phrases)?
  [ ] Are all entries in the batch unique in meaning?

=============================================================================
END OF IJAW LANGUAGE MASTER CONTEXT
=============================================================================
`;
