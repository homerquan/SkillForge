/**
 * Real OpenClaw Gateway backend.
 *
 * Implements `Backend` against the actual Gateway WebSocket protocol (v4),
 * reverse-derived from the public `@openclaw/gateway-protocol` source
 * (github.com/openclaw/openclaw, packages/gateway-protocol/src). The published
 * `@openclaw/gateway-client` package's real `GatewayClient` class (checked
 * directly against its .d.mts) only exposes `start()`/`stop()`/`request()` —
 * no `connect()`/`sendMessage()` as team examples suggested — and still wants
 * a hand-supplied `createSocket` for browser use, so a small hand-rolled
 * client is not a shortcut here, it's the same shape the real one asks for.
 * The wire shapes below (connect handshake, req/res/event envelopes,
 * chat.send/chat.abort, the "chat" event union) come from that protocol
 * source, not guesses — confirmed live against the real gateway, which
 * understood our "connect" frame and returned a real protocol-level
 * rejection (origin allowlist) rather than a parse error.
 *
 * TOOL INTEGRATION IS DELIBERATELY NOT IMPLEMENTED YET. The real robot
 * control is Nav2-based (navigate_to_pose, spin_robot, dock_robot, etc. via
 * nav2_mcp_server) plus not-yet-built semantic actions (explore_area,
 * search_for, inspect...) — NOT the move/rotate/move_arm/gripper vocabulary
 * this UI's RobotAction type currently models. That type will need reworking
 * once the team locks the semantic-action schema; don't build tool-event
 * handling against the old vocabulary in the meantime.
 */

import type { Backend, BackendEvent } from "./types";

const PROTOCOL_VERSION = 4;

// Confirmed working by the OpenClaw teammate: the only configured agent is
// "main", and its session key is this fixed string — no sessions.create
// round trip needed before chat.send.
const SESSION_KEY = "agent:main:main";

const uuid = () => crypto.randomUUID();

type PendingCall = { resolve: (payload: unknown) => void; reject: (err: Error) => void };

export function createRealBackend(url: string, token: string): Backend {
  let ws: WebSocket | null = null;
  let emit: ((e: BackendEvent) => void) | null = null;
  let activeRunId: string | null = null;
  let activeMessageId: string | null = null;
  const pending = new Map<string, PendingCall>();

  function sendFrame(frame: Record<string, unknown>) {
    ws?.send(JSON.stringify(frame));
  }

  function call(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = uuid();
      pending.set(id, { resolve, reject });
      sendFrame({ type: "req", id, method, params });
    });
  }

  // Maps the ChatEventSchema union (state: status | delta | final | aborted |
  // error) onto our BackendEvent contract. See file header re: tool events.
  function handleChatEvent(payload: Record<string, unknown>) {
    if (!emit) return;
    const runId = payload.runId as string | undefined;
    const state = payload.state as string;

    switch (state) {
      case "status":
        emit({ type: "status", state: "thinking", detail: payload.phase as string | undefined });
        break;

      case "delta": {
        if (activeRunId !== runId) {
          activeRunId = runId ?? null;
          activeMessageId = runId ?? uuid();
          emit({ type: "assistant_start", id: activeMessageId });
        }
        emit({
          type: "assistant_delta",
          id: activeMessageId!,
          text: (payload.deltaText as string) ?? "",
        });
        break;
      }

      case "final":
        if (activeMessageId) emit({ type: "assistant_end", id: activeMessageId });
        emit({ type: "status", state: "done" });
        activeRunId = null;
        activeMessageId = null;
        break;

      case "aborted":
        if (activeMessageId) emit({ type: "assistant_end", id: activeMessageId });
        emit({ type: "status", state: "idle", detail: "aborted by operator" });
        activeRunId = null;
        activeMessageId = null;
        break;

      case "error":
        if (activeMessageId) emit({ type: "assistant_end", id: activeMessageId });
        emit({ type: "error", message: (payload.errorMessage as string) ?? "Chat run failed." });
        activeRunId = null;
        activeMessageId = null;
        break;
    }

    // TOOL-INTEGRATION-TODO: session.tool / tools.invoke events carry the
    // robot actions once the team's tool schema is defined. Nothing to parse
    // yet, so `action` events never fire against the real backend — the
    // status/action panel will simply stay at "—" until this lands.
  }

  return {
    label: `openclaw (${url})`,

    connect(onEvent) {
      emit = onEvent;
      const socket = new WebSocket(url);
      ws = socket;

      socket.addEventListener("open", () => {
        call("connect", {
          minProtocol: PROTOCOL_VERSION,
          maxProtocol: PROTOCOL_VERSION,
          client: {
            id: "webchat-ui",
            version: "0.1.0",
            platform: "web",
            mode: "webchat",
          },
          auth: { token },
        })
          .then(() => emit?.({ type: "connection", connected: true }))
          .catch((err: Error) =>
            // Relay the gateway's own message verbatim — it already names the
            // exact fix (origin allowlist, device approval, etc.) more
            // precisely than any guess we could prepend here.
            emit?.({ type: "error", message: `Gateway rejected connection: ${err.message}` })
          );
      });

      socket.addEventListener("close", () => emit?.({ type: "connection", connected: false }));
      socket.addEventListener("error", () =>
        emit?.({ type: "error", message: "Gateway WebSocket error." })
      );

      socket.addEventListener("message", (ev) => {
        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(ev.data as string);
        } catch {
          return;
        }

        if (frame.type === "res") {
          const id = frame.id as string;
          const waiter = pending.get(id);
          if (!waiter) return;
          pending.delete(id);
          if (frame.ok) {
            waiter.resolve(frame.payload);
          } else {
            const error = frame.error as { message?: string } | undefined;
            waiter.reject(new Error(error?.message ?? "Gateway request failed."));
          }
          return;
        }

        if (frame.type === "event" && frame.event === "chat") {
          handleChatEvent(frame.payload as Record<string, unknown>);
        }
      });

      return () => {
        pending.clear();
        socket.close();
        ws = null;
        emit = null;
      };
    },

    sendInstruction(text) {
      void call("chat.send", {
        sessionKey: SESSION_KEY,
        message: text,
        idempotencyKey: uuid(),
      }).catch((err: Error) => {
        emit?.({ type: "error", message: err.message });
      });
    },

    abort() {
      void call("chat.abort", { sessionKey: SESSION_KEY }).catch(() => {
        // Best effort — an abort failing is not itself worth surfacing.
      });
    },
  };
}
