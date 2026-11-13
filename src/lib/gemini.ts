import { GoogleGenAI } from "@google/genai";

const getApiKey = () => {
  // Try Vite's preferred way (VITE_ prefix for client-side)
  const viteKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (viteKey && viteKey.trim() !== '' && viteKey !== 'undefined') {
    return viteKey;
  }
  
  // Fallback for AI Studio or dev
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.trim() !== '' && envKey !== 'undefined') {
    return envKey;
  }
  
  return null;
};

const apiKey = getApiKey();

// Modelo robusto para questões dissertativas e provas mistas (usado com ThinkingLevel.LOW por padrão)
export const GEMINI_MODEL = "gemini-3.8-flash";

// Modelo ultraeconômico para leitura de cartões-resposta (ENEM), provas 100% objetivas, extração de PDF e relatórios
export const GEMINI_LITE_MODEL = "gemini-3.1-flash-lite";

export const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
