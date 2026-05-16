// src/lib/gemini.ts

export const GEMINI_MODEL = "gemini-1.5-flash"; // Standardizing on a stable model

export interface GeminiResponse {
  text: string;
  response: any;
}

export const ai = {
  models: {
    generateContent: async (args: any): Promise<any> => {
      try {
        const response = await fetch("/api/gemini", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...args,
            model: args.model || GEMINI_MODEL
          }),
        });

        if (!response.ok) {
          let errorMsg = `Erro na API: ${response.status}`;
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
          } catch (e) {
            // If not JSON, it might be the HTML 404 page
            const text = await response.text();
            if (text.includes("<!DOCTYPE html>") || text.includes("<html")) {
              errorMsg = "O servidor retornou uma página HTML em vez de JSON (possível erro de rota 404).";
            }
          }
          throw new Error(errorMsg);
        }

        const data = await response.json();
        return {
          text: () => data.text,
          response: data.response
        };
      } catch (error: any) {
        console.error("Gemini Proxy Call Error:", error);
        throw error;
      }
    }
  }
};
