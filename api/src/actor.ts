import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types";

/**
 * RobotActor Durable Object
 * Live per-robot state + command/coordination.
 * Holds last telemetry frame, connected WebSockets (dashboards + the robot agent),
 * current run binding, in-flight commands.
 */
export class RobotActor extends DurableObject<Env> {
  private sessions: Set<WebSocket> = new Set();
  
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/stream")) {
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }

      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair) as [WebSocket, WebSocket];

      server.accept();
      this.sessions.add(server);

      server.addEventListener("message", async (event) => {
        try {
          // Ingest telemetry from robot and write to KV fleet status
          const data = JSON.parse(event.data as string);
          if (data.type === "telemetry") {
            const robotId = url.pathname.split("/")[2]; // /robots/:id/stream
            await this.env.FLEET_STATUS.put(`status:robot:${robotId}`, JSON.stringify({
              ...data.payload,
              last_seen: Date.now()
            }), { expirationTtl: 60 });
            
            // Broadcast to dashboards
            this.broadcast(JSON.stringify({ type: "telemetry", robot_id: robotId, payload: data.payload }), server);
          }
        } catch (e) {
          // ignore parsing errors
        }
      });

      server.addEventListener("close", () => {
        this.sessions.delete(server);
      });
      server.addEventListener("error", () => {
        this.sessions.delete(server);
      });

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    if (request.method === "POST" && url.pathname.endsWith("/commands")) {
      const body = await request.json() as any;
      const cmdStr = JSON.stringify({ type: "command", ...body });
      
      // Dispatch command to all connected WebSockets (including robot agent)
      this.broadcast(cmdStr);
      
      return new Response(JSON.stringify({ status: "dispatched" }), { 
        headers: { "Content-Type": "application/json" } 
      });
    }

    return new Response("Not found", { status: 404 });
  }

  private broadcast(message: string, exclude?: WebSocket) {
    for (const session of this.sessions) {
      if (session !== exclude) {
        try {
          session.send(message);
        } catch (e) {
          this.sessions.delete(session);
        }
      }
    }
  }
}
