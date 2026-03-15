import { supabase } from "@/src/config/supabaseClient";
import { ai as model } from "@/src/ai/aiClient";

/**
 * Test API endpoint to verify Supabase and Gemini AI connections.
 * This endpoint is designed for a Next.js App Router structure.
 * 
 * Requirements:
 * 1. Query "students" table from Supabase (first 3 rows).
 * 2. Send prompt "Say hello in Portuguese" to Gemini.
 * 3. Return results as JSON: { database: ..., ai: ... }
 */
export async function GET() {
  try {
    // 1. Query the "students" table from Supabase and return the first 3 rows.
    const { data: database, error } = await supabase
      .from('students')
      .select('*')
      .limit(3);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // 2. Send a simple prompt to the Gemini model: "Say hello in Portuguese".
    // Using the 'ai' instance (aliased as 'model') to generate content.
    // We use 'gemini-3.1-pro-preview' as it is the recommended model for this environment.
    const aiResponse = await model.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: "Say hello in Portuguese",
    });

    // 3. Return both results as JSON.
    return Response.json({
      database,
      ai: aiResponse.text
    });
  } catch (error: any) {
    console.error('Test endpoint error:', error);
    return Response.json(
      { 
        error: error.message || 'An unexpected error occurred',
        database: null,
        ai: null
      },
      { status: 500 }
    );
  }
}
