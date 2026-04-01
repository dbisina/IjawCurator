/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Firebase
  readonly VITE_FIREBASE_API_KEY?: string;
  // Gemini key rotation pool
  readonly VITE_GEMINI_API_KEY_1?: string;
  readonly VITE_GEMINI_API_KEY_2?: string;
  readonly VITE_GEMINI_API_KEY_3?: string;
  readonly VITE_GEMINI_API_KEY_4?: string;
  readonly VITE_GEMINI_API_KEY_5?: string;
  readonly VITE_GEMINI_API_KEY_6?: string;
  readonly VITE_GEMINI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
