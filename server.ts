import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Request logging for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Explicit API routes BEFORE Vite/Static middleware
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
});

app.post("/api/gemini", async (req, res) => {
  try {
    const { contents, generationConfig, model = "gemini-1.5-flash" } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is not defined in process.env");
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    const ai = new GoogleGenAI({ apiKey });
    // In @google/genai, the method is models.get() or similar? 
    // Checking skill: const model = ai.models.get("gemini-1.5-flash");
    const genModel = ai.models.get(model);

    const result = await genModel.generateContent({ contents, generationConfig });
    const response = await result.response;
    
    res.json({ 
      text: response.text(),
      response: {
        candidates: response.candidates,
        usageMetadata: response.usageMetadata
      }
    });
  } catch (error: any) {
    console.error("Gemini Proxy Error:", error);
    res.status(500).json({ error: error.message || "Failed to process AI request" });
  }
});

// Handle 404 for API routes specifically to avoid falling through to SPA
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware loaded");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static files from dist");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
