/**
 * The contract between the UI and OpenClaw.
 *
 * These types are the whole agreement: the UI renders whatever arrives as a
 * `BackendEvent` and knows nothing else about the backend. When the real
 * endpoint lands, only `backend.ts` changes — nothing here or in any
 * component should need to.
 */

/**
 * The robot's action vocabulary.
 *
 * SPEC.md described an arm/gripper set (move, rotate, move_arm,
 * open_gripper, close_gripper). The stack actually shipped a Nav2 mobile-base
 * toolset (get_robot_pose, navigate_to_pose, spin_robot, dock_robot, ...)
 * plus semantic perception tools (explore_area, search_for, inspect,
 * detect_failure, record_finding), surfaced over MCP with a server prefix
 * like `nav2__get_robot_pose`. The names are therefore open-ended: the union
 * below documents what we know while `(string & {})` keeps any real tool
 * name valid, so the UI never has to change when a tool is added.
 */
export type ActionName =
  // Original SPEC.md vocabulary — still used by the mock backend.
  | "move"
  | "rotate"
  | "move_arm"
  | "open_gripper"
  | "close_gripper"
  // Nav2 tools exposed by nav2_mcp_server.
  | "get_robot_pose"
  | "navigate_to_pose"
  | "spin_robot"
  | "backup_robot"
  | "dock_robot"
  | "undock_robot"
  | "cancel_navigation"
  // Semantic perception tools.
  | "navigate_to"
  | "explore_area"
  | "search_for"
  | "inspect"
  | "detect_failure"
  | "record_finding"
  | "return_home"
  | "stop_task"
  | (string & {});

export interface RobotAction {
  name: ActionName;
  /** Free-form so the UI does not have to change when arguments do. */
  args?: Record<string, unknown>;
}

/** Rendered verbatim in the status panel. */
export function formatAction(a: RobotAction): string {
  const args = Object.entries(a.args ?? {})
    .map(([k, v]) => `${k}=${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(", ");
  return `${a.name}(${args})`;
}

export type RunState = "idle" | "thinking" | "executing" | "done" | "error";
export type ServiceState = "loading" | "online" | "offline";

export interface ServiceStatus {
  state: ServiceState;
  detail: string;
}

export interface RobotTelemetry {
  ros: ServiceStatus;
  camera: ServiceStatus;
  navigation: ServiceStatus;
  agent: ServiceStatus;
  knowledge: ServiceStatus;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Actions the assistant committed to in this turn, shown inline. */
  actions?: RobotAction[];
  /** True while the text is still streaming in. */
  pending?: boolean;
}

/**
 * Everything the backend can tell the UI.
 *
 * Modelled as a stream of events rather than request/response because the
 * interesting parts — the robot executing, the camera, status changes — arrive
 * unprompted over a WebSocket. A promise-shaped API would have to be torn out
 * the moment the real backend arrives.
 */
export type BackendEvent =
  | { type: "connection"; connected: boolean }
  /** A new assistant turn began. */
  | { type: "assistant_start"; id: string }
  /** Incremental text for the assistant turn in flight. */
  | { type: "assistant_delta"; id: string; text: string }
  /** The assistant turn is complete. */
  | { type: "assistant_end"; id: string }
  /** The agent decided on an action; it has not necessarily run yet. */
  | { type: "action"; id: string; action: RobotAction }
  /** Execution state, with the action currently running if there is one. */
  | { type: "status"; state: RunState; action?: RobotAction; detail?: string }
  /** A camera frame, as anything an <img>/<video> can take. */
  | { type: "frame"; src: string }
  /** A periodic perception summary generated from the latest ROS detections. */
  | { type: "scene"; summary: string; alert?: string }
  /** Health of the local services that make up the robot stack. */
  | { type: "telemetry"; telemetry: RobotTelemetry }
  | { type: "error"; message: string };

/**
 * What a backend must provide. Implemented twice: once against mock data so
 * the UI is buildable today, once against OpenClaw when the endpoint exists.
 */
export interface Backend {
  /** Human-readable, shown in the status panel so it is never ambiguous
   * which backend is live. */
  readonly label: string;
  /** Begin receiving events. Returns an unsubscribe function. */
  connect(onEvent: (e: BackendEvent) => void): () => void;
  /** Send a human instruction. Results arrive as events, not as a return. */
  sendInstruction(text: string): void;
  /** Stop whatever the robot is doing. */
  abort(): void;
}
