import { GoogleGenAI } from "@google/genai";

const getApiKey = () => {
  // Try Vite's preferred way first for production/Vercel
  const viteKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (viteKey && viteKey !== 'undefined' && viteKey !== 'null' && viteKey.trim() !== '') {
    return viteKey;
  }
  
  // Handled specifically for AI Studio environment
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey !== 'undefined' && envKey !== 'null' && envKey.trim() !== '') {
    return envKey;
  }
  
  return null;
};

const apiKey = getApiKey();

export const GEMINI_MODEL = "gemini-1.5-flash";

export const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
