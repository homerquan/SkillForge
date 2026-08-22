import { useEffect, useState } from "react";
import { formatAction, type RobotAction, type RobotTelemetry, type RunState, type ServiceState } from "../lib/types";

interface Props {
  frame: string | null;
  state: RunState;
  action: RobotAction | null;
  detail: string | null;
  connected: boolean;
  backendLabel: string;
  sceneSummary: string | null;
  sceneAlert: string | null;
  telemetry: RobotTelemetry | null;
}

const STATE_TEXT: Record<RunState, string> = {
  idle: "Idle",
  thinking: "Thinking",
  executing: "Executing",
  done: "Complete",
  error: "Error",
};

export function RobotPanel({
  frame,
  state,
  action,
  detail,
  connected,
  backendLabel,
  sceneSummary,
  sceneAlert,
  telemetry,
}: Props) {
  const [snapshotSrc, setSnapshotSrc] = useState<string | null>(() =>
    frame?.includes("/snapshot") ? `${frame}${frame.includes("?") ? "&" : "?"}_=${Date.now()}` : null
  );
  const imageSrc = frame?.includes("/snapshot") ? snapshotSrc : frame;

  useEffect(() => {
    if (!frame?.includes("/snapshot")) return;
    const refresh = () => setSnapshotSrc(`${frame}${frame.includes("?") ? "&" : "?"}_=${Date.now()}`);
    const timer = window.setInterval(refresh, 500);
    return () => window.clearInterval(timer);
  }, [frame]);

  return (
    <section className="panel robot">
      <header className="panel-head">
        <h2>
          <span className={`dot ${connected ? "on" : ""}`} title={backendLabel} />
          Live Robot
        </h2>
      </header>

      <div className="viewport">
        {imageSrc ? (
          <img src={imageSrc} alt="Isaac Sim camera" />
        ) : (
          <div className="viewport-empty">waiting for camera…</div>
        )}
        <span className="feed-tag">isaac-sim · camera_0 · live</span>
      </div>

      <dl className="status">
        <div>
          <dt>Status</dt>
          <dd><span className={`state ${state}`} />{STATE_TEXT[state]}</dd>
        </div>
        <div>
          <dt>Action</dt>
          <dd className="mono">{action ? formatAction(action) : "—"}</dd>
        </div>
        <div>
          <dt>Robot</dt>
          <dd>{telemetry?.ros.state === "online" ? "Connected" : telemetry?.ros.state === "offline" ? "Offline" : "Loading"}</dd>
        </div>
      </dl>

      <section className="system-health" aria-live="polite">
        <span className="health-title">System status</span>
        {([
          ["ROS 2", telemetry?.ros],
          ["Camera", telemetry?.camera],
          ["Nav2", telemetry?.navigation],
          ["OpenClaw", telemetry?.agent],
          ["MongoDB", telemetry?.knowledge],
        ] as const).map(([label, service]) => (
          <div className="health-row" key={label} title={service?.detail ?? "Waiting for bridge telemetry"}>
            <span className={`health-dot ${service?.state ?? "loading"}`} />
            <span>{label}</span>
            <strong>{labelForState(service?.state ?? "loading")}</strong>
          </div>
        ))}
      </section>

      <section className={`scene-summary${sceneAlert ? " alert" : ""}`} aria-live="polite">
        <span>Scene summary</span>
        <p>{sceneSummary ?? "Waiting for response."}</p>
        {sceneAlert && <strong>Alert: {sceneAlert}</strong>}
      </section>

      <footer className="panel-foot">
        {detail ?? `backend: ${backendLabel}`}
      </footer>
    </section>
  );
}

function labelForState(state: ServiceState): string {
  return state === "online" ? "Online" : state === "offline" ? "Offline" : "Loading";
}
