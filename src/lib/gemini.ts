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

// Use standard stable model with explicit prefix
export const GEMINI_MODEL = "models/gemini-1.5-flash";

export const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
