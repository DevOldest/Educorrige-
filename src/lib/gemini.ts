import { GoogleGenAI } from "@google/genai";

const getApiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'undefined' || key === 'null' || key.trim() === '') {
    return null;
  }
  return key;
};

const apiKey = getApiKey();

export const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
