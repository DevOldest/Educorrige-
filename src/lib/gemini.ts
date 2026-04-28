import { GoogleGenAI } from "@google/genai";

const getApiKey = () => {
  // 1. Try Vite's preferred way (Strictly for Browser/Frontend)
  const viteKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (viteKey && viteKey !== 'undefined' && viteKey !== 'null' && viteKey.trim() !== '') {
    return viteKey;
  }
  
  // 2. Fallback for AI Studio or local dev environment
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey !== 'undefined' && envKey !== 'null' && envKey.trim() !== '') {
    return envKey;
  }
  
  return null;
};

const apiKey = getApiKey();

// Use a supported model for the environment
export const GEMINI_MODEL = "gemini-3-flash-preview";

export const ai = apiKey ? new GoogleGenAI({ 
  apiKey
}) : null;
