// src/lib/gemini.ts

export const GEMINI_MODEL = "gemini-1.5-flash"; // Standardizing on a stable model

export interface GeminiResponse {
  text: string;
  response: any;
}

export const ai = {
  models: {
    generateContent: async (args: any): Promise<GeminiResponse> => {
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
          const errorData = await response.json();
          throw new Error(errorData.error || `Erro na API: ${response.status}`);
        }

        const data = await response.json();
        return {
          text: data.text,
          response: data.response,
          // Add helper method to match SDK signature if needed
          // @ts-ignore
          text: () => data.text 
        } as any;
      } catch (error: any) {
        console.error("Gemini Proxy Call Error:", error);
        throw error;
      }
    }
  }
};
