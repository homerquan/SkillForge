/**
 * Real OpenClaw Gateway backend — device-paired auth.
 *
 * Earlier version hand-rolled the WebSocket envelope for plain shared-token
 * auth, which worked but only ever granted a default/reduced scope. Getting
 * `operator.write` requires a genuine device-paired connection: the gateway
 * pushes a `connect.challenge` event (a server-issued nonce + timestamp)
 * that must be Ed25519-signed by a stable per-browser device identity, and
 * approved once via `openclaw devices approve` on the workstation.
 *
 * That handshake — wait for the challenge, sign it, retry/backoff policy —
 * is exactly what `GatewayProtocolClient` from `@openclaw/gateway-client/
 * browser` already implements correctly, so this uses the real class
 * instead of re-deriving that state machine by hand. `GatewayClient` (the
 * friendly all-in-one wrapper) is NOT used here: it only ships from the
 * package's main entry, which depends on Node's `ws`/`node:crypto` and does
 * not bundle for a browser target.
 *
 * All shapes below (ConnectParams, the challenge event, ChatEventSchema) are
 * taken directly from the OpenClaw source (github.com/openclaw/openclaw,
 * packages/gateway-protocol and packages/gateway-client), not guessed.
 *
 * TOOL INTEGRATION IS DELIBERATELY NOT IMPLEMENTED YET. The real robot
 * control is Nav2-based (navigate_to_pose, spin_robot, dock_robot, etc. via
 * nav2_mcp_server) plus not-yet-built semantic actions (explore_area,
 * search_for, inspect...) — NOT the move/rotate/move_arm/gripper vocabulary
 * this UI's RobotAction type currently models. That type will need reworking
 * once the team locks the semantic-action schema.
 */

import {
  DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS,
  GatewayBrowserDeviceAuthLifecycle,
  GatewayProtocolClient,
  type GatewayBrowserDeviceAuthPlan,
  type GatewayProtocolSocket,
  type GatewayProtocolSocketHandlers,
  PROTOCOL_VERSION,
} from "@openclaw/gateway-client/browser";
import { loadDeviceIdentity } from "./deviceIdentity";
import { deviceTokenStore } from "./deviceTokenStore";
import type { Backend, BackendEvent } from "./types";

// Confirmed working by the OpenClaw teammate: the only configured agent is
// "main", and its session key is this fixed string.
const SESSION_KEY = "agent:main:main";

const CLIENT = {
  id: "webchat-ui",
  version: "0.1.0",
  platform: "web",
  mode: "webchat",
} as const;

const DEFAULT_SCOPES = ["operator.read", "operator.write"] as const;

function createBrowserSocket(url: string, handlers: GatewayProtocolSocketHandlers): GatewayProtocolSocket {
  const ws = new WebSocket(url);
  ws.addEventListener("open", () => handlers.open());
  ws.addEventListener("message", (ev) => handlers.message(String(ev.data)));
  ws.addEventListener("close", (ev) => handlers.close(ev.code, ev.reason));
  ws.addEventListener("error", () => handlers.error(new Error("WebSocket error")));
  return {
    isOpen: () => ws.readyState === WebSocket.OPEN,
    send: (data) => ws.send(data),
    // The library closes with protocol-level codes (e.g. 1008 "policy
    // violation") that are legal on a CloseEvent received from a server but
    // rejected by the browser's own WebSocket.close() API, which only
    // accepts 1000 or 3000-4999 from script. Fall back to a codeless close
    // rather than letting that throw and crash the reconnect flow.
    close: (code, reason) => {
      try {
        ws.close(code, reason);
      } catch {
        ws.close();
      }
    },
  };
}

export function createRealBackend(url: string, token: string): Backend {
  let emit: ((e: BackendEvent) => void) | null = null;
  let activeRunId: string | null = null;
  let activeMessageId: string | null = null;

  const lifecycle = new GatewayBrowserDeviceAuthLifecycle({
    loadIdentity: loadDeviceIdentity,
    tokenStore: deviceTokenStore,
  });

  const client = new GatewayProtocolClient<GatewayBrowserDeviceAuthPlan>({
    createSocket: (handlers) => createBrowserSocket(url, handlers),
    createRequestId: () => crypto.randomUUID(),
    requestTimeoutMs: DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS,
    reconnect: { initialMs: 500, maxMs: 10_000, multiplier: 2 },
    // "fallback": if the gateway doesn't push connect.challenge within
    // timeoutMs, proceed without a nonce rather than hanging forever. A
    // genuine device-paired connect still requires the real nonce to
    // produce a valid signature — this only affects how we fail, not
    // whether unsigned connects are accepted.
    handshake: { mode: "fallback", timeoutMs: 4000 },

    buildConnectPlan: ({ nonce, challengeTs }) =>
      lifecycle.buildPlan({
        client: CLIENT,
        role: "operator",
        defaultScopes: DEFAULT_SCOPES,
        token,
        nonce,
        challengeTs,
      }),

    buildConnectParams: (plan) => ({
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: CLIENT,
      role: plan.role,
      scopes: plan.scopes,
      device: plan.device,
      auth: plan.auth,
    }),

    onConnectHello: (hello, context) => {
      void lifecycle.acceptHello(hello, context.plan);
    },
    onHello: () => emit?.({ type: "connection", connected: true }),
    onConnectError: (err) => emit?.({ type: "error", message: `Gateway connect failed: ${err.message}` }),
    onConnectFailure: (err) => {
      emit?.({ type: "error", message: `Gateway rejected connection: ${err.message}` });
      return { closeCode: 1008, closeReason: "connect failed" };
    },
    resolveClose: () => ({ retry: true, notify: true }),
    onClose: () => emit?.({ type: "connection", connected: false }),

    onEvent: (frame) => {
      if (frame.event === "chat") {
        handleChatEvent(frame.payload as Record<string, unknown>);
      }
    },
    onParseError: (err) => console.error("gateway frame parse error", err),
    onCallbackError: (label, err) => console.error(`gateway callback error (${label})`, err),
  });

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
          activeMessageId = runId ?? crypto.randomUUID();
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
    // robot actions once the team's tool schema is defined.
  }

  return {
    label: `openclaw (${url})`,

    connect(onEvent) {
      emit = onEvent;
      client.start();
      return () => {
        client.stop();
        emit = null;
      };
    },

    sendInstruction(text) {
      void client
        .request("chat.send", { sessionKey: SESSION_KEY, message: text, idempotencyKey: crypto.randomUUID() })
        .catch((err: Error) => emit?.({ type: "error", message: err.message }));
    },

    abort() {
      void client.request("chat.abort", { sessionKey: SESSION_KEY }).catch(() => {
        // Best effort — an abort failing is not itself worth surfacing.
      });
    },
  };
}
