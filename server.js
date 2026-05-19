import "dotenv/config";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from "url";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-image";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function buildPrompt(lastStroke, recentStrokes, customPrompt) {
  let spatial = "";

  if (lastStroke) {
    spatial = `
The user's most recent stroke:
- Style: color ${lastStroke.color}, ${lastStroke.size}px width, ${lastStroke.brush} brush
- Shape: ${lastStroke.curvature}`;

    if (recentStrokes && recentStrokes.length > 1) {
      spatial += "\n\nRecent strokes for context:";
      for (let i = 0; i < recentStrokes.length - 1; i++) {
        const s = recentStrokes[i];
        spatial += `\n  Stroke ${i + 1}: ${s.curvature}, ${s.color}`;
      }
    }
  }

  const systemPrompt = `You are an imaginative collaborative artist. The user will show you their drawing. Your job is to RECOGNIZE what they drew and then generate ONLY a new complementary drawing — do NOT include or reproduce the user's drawing in your output.

CRITICAL OUTPUT RULE:
- Your generated image must contain ONLY your new addition on a plain white background
- Do NOT redraw, copy, or include any part of the user's original drawing
- The user's drawing will be composited separately — you only provide the new companion element

What to draw:
- Identify what the user drew (a flower, a house, a face, an animal, a shape, etc.)
- Draw something that COMPLEMENTS or ACCOMPANIES it
  Examples:
    • User draws a flower → you draw a bee, butterfly, or sun
    • User draws a house → you draw a tree, path, or clouds
    • User draws a fish → you draw bubbles, seaweed, or another fish
    • User draws a moon → you draw stars or a night sky
    • User draws a person → you draw a pet, hat, or scenery
    • User draws an abstract shape → you draw a complementary abstract form

Style rules:
- Match the general artistic style (if they draw simple/cartoonish, you draw simple/cartoonish)
- DO NOT add any text: no letters, words, numbers, signatures, watermarks, or captions
- Output must be ONLY your new drawing on a white background — nothing else
- Be creative and surprising
${spatial}`;

  const userPrompt = customPrompt ||
    "Look at what I've drawn and figure out what it is. Then generate ONLY a new companion drawing on a plain white background — do NOT include my drawing in your output. Just the new element that goes with what I drew.";

  return { systemPrompt, userPrompt };
}

app.post("/api/collaborate", async (req, res) => {
  try {
    const { image, lastStroke, recentStrokes, prompt } = req.body;

    if (!image) {
      return res.status(400).json({ error: "No image provided" });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const { systemPrompt, userPrompt } = buildPrompt(lastStroke, recentStrokes, prompt);

    console.log(`[API] Request → model: ${MODEL}`);
    if (lastStroke) {
      console.log(`[API] Stroke endpoint: (${lastStroke.end.x}, ${lastStroke.end.y}), shape: ${lastStroke.curvature}`);
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: systemPrompt + "\n\n" + userPrompt },
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Data,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    let aiImage = null;
    let aiText = null;
    const parts = response?.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.inlineData) {
        aiImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
      if (part.text) {
        aiText = part.text;
      }
    }

    if (!aiImage) {
      console.warn("[API] No image returned. Text:", aiText);
      return res.status(500).json({
        error: "AI did not return an image",
        text: aiText,
      });
    }

    console.log("[API] Image received, sending to client");
    res.json({ image: aiImage, text: aiText });
  } catch (err) {
    const message = err?.message || (typeof err === "object" ? JSON.stringify(err) : String(err));
    console.error("[API] Error:", message);
    const status = message.includes("429") || message.includes("quota") ? 429 : 500;
    res.status(status).json({ error: message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, model: MODEL });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`CoCreate Canvas running at http://localhost:${PORT}`);
    console.log(`Using model: ${MODEL}`);
  });
}

export default app;
