import type { Backend, BackendEvent, RobotAction } from "./types";

/** Browser client for the local SkillForge bridge. */
export function createRealBackend(baseUrl: string): Backend {
  let emit: ((event: BackendEvent) => void) | null = null;
  let events: EventSource | null = null;
  let request: AbortController | null = null;

  const endpoint = baseUrl.replace(/\/$/, "");

  return {
    label: `OpenClaw via ${endpoint}`,

    connect(onEvent) {
      emit = onEvent;
      events = new EventSource(`${endpoint}/api/events`);
      events.onopen = () => onEvent({ type: "connection", connected: true });
      events.onerror = () => onEvent({ type: "connection", connected: false });
      events.addEventListener("scene", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent<string>).data) as {
            summary: string;
            alert?: string;
          };
          onEvent({ type: "scene", ...data });
        } catch {
          onEvent({ type: "error", message: "Invalid scene event from bridge." });
        }
      });
      events.addEventListener("telemetry", (event) => {
        try {
          onEvent({ type: "telemetry", telemetry: JSON.parse((event as MessageEvent<string>).data) });
        } catch {
          onEvent({ type: "error", message: "Invalid system status from bridge." });
        }
      });
      return () => {
        request?.abort();
        events?.close();
        events = null;
        emit = null;
      };
    },

    async sendInstruction(text) {
      if (!emit) return;
      const id = `openclaw-${Date.now()}`;
      request?.abort();
      request = new AbortController();
      emit({ type: "status", state: "thinking" });
      emit({ type: "assistant_start", id });
      // Confirm receipt immediately; OpenClaw and ROS2 can take several seconds
      // to return a validated plan and the operator should never see a blank turn.
      emit({ type: "assistant_delta", id, text: "OpenClaw received the instruction. " });

      try {
        const response = await fetch(`${endpoint}/api/instructions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: request.signal,
        });
        const result = await response.json() as {
          reply?: string;
          actions?: RobotAction[];
          error?: string;
        };
        if (!response.ok || result.error) throw new Error(result.error ?? "OpenClaw request failed.");

        emit({ type: "assistant_delta", id, text: result.reply ?? "No response returned." });
        for (const action of result.actions ?? []) {
          emit({ type: "action", id, action });
        }
        emit({ type: "assistant_end", id });
        emit({ type: "status", state: result.actions?.length ? "executing" : "idle" });
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return;
        emit({ type: "assistant_end", id });
        emit({ type: "error", message: error instanceof Error ? error.message : "OpenClaw request failed." });
      }
    },

    abort() {
      request?.abort();
      void fetch(`${endpoint}/api/stop`, { method: "POST" });
      emit?.({ type: "status", state: "idle", detail: "stop requested by operator" });
    },
  };
}
