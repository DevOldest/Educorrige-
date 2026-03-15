import { supabase } from "@/src/config/supabaseClient";
import { ai as model } from "@/src/ai/aiClient";

/**
 * Health check API endpoint for the EduAssess platform.
 * Verifies environment variables, database connectivity, and AI service availability.
 */
export async function GET() {
  let environmentStatus = "ok";
  let databaseStatus = "ok";
  let aiStatus = "ok";

  // 1. Check environment variables
  const requiredEnvVars = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "GEMINI_API_KEY"];
  const missingVars = requiredEnvVars.filter((key) => !process.env[key]);
  
  if (missingVars.length > 0) {
    environmentStatus = "missing variables";
  }

  // 2. Test Supabase database connection
  try {
    const { error } = await supabase.from("students").select("*").limit(1);
    if (error) {
      databaseStatus = "error";
    }
  } catch (err) {
    databaseStatus = "error";
  }

  // 3. Test Gemini AI connection
  try {
    // Using the recommended model for this environment
    const response = await model.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: "Respond only with the word OK",
    });

    if (!response.text) {
      aiStatus = "error";
    }
  } catch (err) {
    aiStatus = "error";
  }

  // Return the health status as JSON
  return Response.json({
    environment: environmentStatus,
    database: databaseStatus,
    ai: aiStatus,
  });
}
