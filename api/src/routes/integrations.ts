import { HTTPException } from "hono/http-exception";
import type { App } from "../index";
import type { Row } from "../types";

export function mountIntegrations(app: App): void {
  // Get all configured integrations for the current user (boolean flags only)
  app.get("/integrations", async (c) => {
    const p = c.get("principal");
    const { results } = await c.env.DB
      .prepare(`SELECT provider FROM integration_keys WHERE subject = ?`)
      .bind(p.name).all<{ provider: string }>();
    
    return c.json({
      configured: results.map((r) => r.provider),
      // include global fallbacks for legacy internal tools mode
      has_global_roboflow: Boolean(c.env.ROBOFLOW_API_KEY)
    });
  });

  // Save an integration key (BYOK)
  app.post("/integrations", async (c) => {
    const p = c.get("principal");
    const b = await c.req.json<{ provider?: string; api_key?: string }>().catch(() => ({}));
    
    const provider = (b.provider ?? "").trim().toLowerCase();
    const apiKey = (b.api_key ?? "").trim();
    
    if (!provider || !apiKey) {
      throw new HTTPException(400, { message: "provider and api_key are required" });
    }
    
    if (provider !== "roboflow") {
      throw new HTTPException(400, { message: "unsupported provider. (currently only 'roboflow' is supported)" });
    }

    await c.env.DB.prepare(
      `INSERT INTO integration_keys (subject, provider, api_key) 
       VALUES (?, ?, ?) 
       ON CONFLICT(subject, provider) DO UPDATE SET 
         api_key = excluded.api_key, 
         updated_at = datetime('now')`
    ).bind(p.name, provider, apiKey).run();

    return c.json({ success: true, provider });
  });

  // Remove an integration key
  app.delete("/integrations/:provider", async (c) => {
    const p = c.get("principal");
    const provider = c.req.param("provider").toLowerCase();
    
    await c.env.DB.prepare(`DELETE FROM integration_keys WHERE subject = ? AND provider = ?`)
      .bind(p.name, provider).run();
      
    return c.json({ success: true });
  });
}
