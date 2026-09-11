import { Hono } from "hono";
import type { Env, Vars } from "../types";

export const chat = new Hono<{ Bindings: Env; Variables: Vars }>();

chat.post("/", async (c) => {
  const { messages } = await c.req.json();
  const apiKey = c.env.GEMINI_API_KEY;

  if (!apiKey) {
    return c.json({ error: "GEMINI_API_KEY is not configured on the backend." }, 500);
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: "You are Charmy, the friendly, highly capable AI assistant and workflow guide for the CharmQuark platform. You help RobotOps teams schedule missions, review QA, and navigate the platform. Keep your answers concise, helpful, and act like a wizard guide." }]
    },
    contents: messages // Expected format: { role: "user"|"model", parts: [{text: "..."}] }[]
  };

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    return c.json({ error: "Failed to fetch from Gemini", details: err }, 500);
  }

  const data = await res.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't process that.";

  return c.json({ text });
});
