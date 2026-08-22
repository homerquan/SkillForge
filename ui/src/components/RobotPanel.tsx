import { formatAction, type RobotAction, type RunState } from "../lib/types";

interface Props {
  frame: string | null;
  state: RunState;
  action: RobotAction | null;
  detail: string | null;
  connected: boolean;
  backendLabel: string;
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
}: Props) {
  return (
    <section className="panel robot">
      <header className="panel-head">
        <h2>
          <span className={`dot ${connected ? "on" : ""}`} title={backendLabel} />
          Live Robot
        </h2>
      </header>

      <div className="viewport">
        {frame ? (
          <img src={frame} alt="Isaac Sim camera" />
        ) : (
          <div className="viewport-empty">waiting for camera…</div>
        )}
        <span className="feed-tag">isaac-sim · camera_0</span>
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
          <dd>{connected ? "Connected" : "Offline"}</dd>
        </div>
      </dl>

      <footer className="panel-foot">
        {detail ?? `backend: ${backendLabel}`}
      </footer>
    </section>
  );
}
