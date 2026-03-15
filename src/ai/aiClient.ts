import { GoogleGenAI } from "@google/genai";

/**
 * Gemini AI client configuration.
 * Uses the @google/genai SDK as per platform requirements.
 * Model: gemini-3.1-pro-preview (recommended for complex reasoning)
 */
const apiKey = process.env.GEMINI_API_KEY || '';

if (!apiKey) {
  console.warn('GEMINI_API_KEY missing. Please check your environment variables.');
}

export const ai = new GoogleGenAI({ apiKey });

// We export a helper to get the model with standard config
export const getGeminiModel = () => {
  return "gemini-3.1-pro-preview";
};
