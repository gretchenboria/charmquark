"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";

export function LiveTelemetry({ robotId }: { robotId: string }) {
  const toast = useToast();
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [telemetry, setTelemetry] = useState<any>(null);
  const [commanding, setCommanding] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    setStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    
    // the API is mounted at /api/ on the edge in prod, but next.config.mjs rewrites it locally too
    const url = `${protocol}//${host}/api/robots/${robotId}/stream`;
    
    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onopen = () => setStatus("connected");
    socket.onclose = () => setStatus("disconnected");
    socket.onerror = () => setStatus("disconnected");
    socket.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "telemetry" && data.robot_id === robotId) {
          setTelemetry(data.payload);
        }
      } catch (e) {}
    };

    return () => {
      socket.close();
    };
  }, [robotId]);

  const sendCommand = async (cmd: string) => {
    setCommanding(true);
    try {
      await api.sendRobotCommand(robotId, cmd);
      toast("success", `Command '${cmd}' dispatched`);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Dispatch failed");
    } finally {
      setCommanding(false);
    }
  };

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${status === 'connected' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
          Live Connection
        </h3>
        <span className="text-xs text-neutral-500">{status}</span>
      </div>

      <div className="flex gap-2 mb-4">
        <button 
          disabled={commanding || status !== 'connected'}
          onClick={() => sendCommand("ping")}
          className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Ping
        </button>
        <button 
          disabled={commanding || status !== 'connected'}
          onClick={() => sendCommand("start_record")}
          className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Start Record
        </button>
        <button 
          disabled={commanding || status !== 'connected'}
          onClick={() => sendCommand("stop_record")}
          className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Stop Record
        </button>
        <button 
          disabled={commanding || status !== 'connected'}
          onClick={() => sendCommand("estop")}
          className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          E-STOP
        </button>
      </div>

      <div className="bg-neutral-900 rounded p-3 text-xs text-green-400 font-mono h-32 overflow-y-auto">
        {telemetry ? (
          <pre>{JSON.stringify(telemetry, null, 2)}</pre>
        ) : (
          <span className="text-neutral-500">Waiting for telemetry stream...</span>
        )}
      </div>
    </div>
  );
}
