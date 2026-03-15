import { ai, getGeminiModel } from './aiClient';

/**
 * Tests the connection to Google Gemini AI.
 */
export async function testAI() {
  console.log('Testing Gemini AI connection...');
  try {
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: "Hello! This is a test from the EduAssess AI platform. Please respond with a short greeting.",
    });

    console.log('Gemini AI Response:', response.text);
  } catch (error) {
    console.error('Error testing Gemini AI:', error);
  }
}
