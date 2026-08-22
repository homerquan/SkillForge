import { useEffect, useMemo, useRef, useState } from "react";
import { ConversationPanel } from "./components/ConversationPanel";
import { RobotPanel } from "./components/RobotPanel";
import { createBackend } from "./lib/backend";
import type { BackendEvent, ChatMessage, RobotAction, RobotTelemetry, RunState } from "./lib/types";
import "./App.css";

// When set, the video panel points straight at the LAN MJPEG stream from the
// GB10's web_video_server instead of whatever the backend emits as "frame"
// events. This is deliberately independent of the conversation backend
// (mock or real) — the two teammate-owned halves land on separate schedules.
const cameraUrl = import.meta.env.VITE_CAMERA_URL as string | undefined;

export default function App() {
  // One backend for the life of the app. Which one is decided in backend.ts.
  const backend = useMemo(() => createBackend(), []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<RunState>("idle");
  const [action, setAction] = useState<RobotAction | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [sceneSummary, setSceneSummary] = useState<string | null>(null);
  const [sceneAlert, setSceneAlert] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<RobotTelemetry | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastInstruction, setLastInstruction] = useState<string | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    // Reduce the event stream into the two things the UI renders: a list of
    // messages, and the current robot status. Every branch here corresponds
    // to one BackendEvent variant — see lib/types.ts.
    const unsubscribe = backend.connect((e: BackendEvent) => {
      switch (e.type) {
        case "connection":
          setConnected(e.connected);
          break;

        case "assistant_start":
          setMessages((m) => [
            ...m,
            { id: e.id, role: "assistant", text: "", pending: true },
          ]);
          break;

        case "assistant_delta":
          setMessages((m) =>
            m.map((x) => (x.id === e.id ? { ...x, text: x.text + e.text } : x))
          );
          break;

        case "assistant_end":
          setMessages((m) =>
            m.map((x) => (x.id === e.id ? { ...x, pending: false } : x))
          );
          break;

        case "action":
          // Attach to the turn that produced it, so actions read as part of
          // what the agent said rather than as a separate log.
          setMessages((m) =>
            m.map((x) =>
              x.id === e.id ? { ...x, actions: [...(x.actions ?? []), e.action] } : x
            )
          );
          break;

        case "status":
          setState(e.state);
          setAction(e.action ?? null);
          setDetail(e.detail ?? null);
          break;

        case "frame":
          setFrame(e.src);
          break;

        case "scene":
          setSceneSummary(e.summary);
          setSceneAlert(e.alert ?? null);
          break;

        case "telemetry":
          setTelemetry(e.telemetry);
          break;

        case "error":
          setState("error");
          setDetail(e.message);
          setMessages((messages) => {
            const pendingIndex = messages.findLastIndex((message) =>
              message.role === "assistant" && message.pending
            );
            if (pendingIndex < 0) {
              return [...messages, { id: `e${++idRef.current}`, role: "assistant", text: `OpenClaw error: ${e.message}` }];
            }
            return messages.map((message, index) => index === pendingIndex
              ? { ...message, pending: false, text: message.text || `OpenClaw error: ${e.message}` }
              : message
            );
          });
          break;
      }
    });
    return unsubscribe;
  }, [backend]);

  function send(text: string) {
    setMessages((m) => [
      ...m,
      { id: `u${++idRef.current}`, role: "user", text },
    ]);
    setLastInstruction(text);
    backend.sendInstruction(text);
  }

  function clear() {
    setMessages([]);
  }

  const busy = state === "thinking" || state === "executing";

  return (
    <div className="app">
      <header className="topbar">
        <h1>SkillForge</h1>
        <span className="sub">Human → AI → Robot</span>
      </header>
      <main className="split">
        <ConversationPanel
          messages={messages}
          busy={busy}
          onSend={send}
          onAbort={() => backend.abort()}
          onClear={clear}
          errorMessage={state === "error" ? detail : null}
          onRetry={lastInstruction ? () => send(lastInstruction) : undefined}
        />
        <RobotPanel
          frame={cameraUrl ?? frame}
          state={state}
          action={action}
          detail={detail}
          connected={connected}
          backendLabel={backend.label}
          sceneSummary={sceneSummary}
          sceneAlert={sceneAlert}
          telemetry={telemetry}
        />
      </main>
    </div>
  );
}
