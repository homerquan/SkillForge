/**
 * Mock OpenClaw — enough behaviour to build and demo the UI against.
 *
 * The point is not to be clever. It is to produce the same SHAPE of event
 * stream the real agent will: an assistant turn that streams in token by
 * token, a set of actions, then execution that moves through them one at a
 * time with status changes. If the UI looks right against this, it will look
 * right against the real thing.
 *
 * The instruction parsing is deliberately shallow keyword matching. Any
 * effort spent making it smarter is effort thrown away the moment the real
 * agent arrives — the mock's job is timing and structure, not language.
 */

import type { Backend, BackendEvent, RobotAction } from "./types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let counter = 0;
const nextId = () => `m${++counter}`;

/** Shallow keyword read of an instruction into a plausible action sequence. */
function planActions(text: string): { reply: string; actions: RobotAction[] } {
  const t = text.toLowerCase();
  const target =
    /blue box/.test(t) ? "blue_box" :
    /red/.test(t) ? "red_box" :
    /green/.test(t) ? "green_box" :
    /table/.test(t) ? "table" : "object";

  const wantsPick = /(pick|grab|take|lift|grasp)/.test(t);
  const wantsPlace = /(place|put|drop|release|set down)/.test(t);
  const wantsMove = /(move|go|drive|approach|navigate)/.test(t);
  const wantsTurn = /(turn|rotate|spin|face)/.test(t);

  const actions: RobotAction[] = [];
  if (wantsTurn && !wantsMove && !wantsPick) {
    actions.push({ name: "rotate", args: { degrees: 90 } });
  }
  if (wantsMove || wantsPick || wantsPlace) {
    actions.push({ name: "move", args: { to: target === "object" ? "table" : target } });
  }
  if (wantsPick) {
    actions.push({ name: "move_arm", args: { pose: "pre_grasp", target } });
    actions.push({ name: "close_gripper", args: { force: 0.4 } });
    actions.push({ name: "move_arm", args: { pose: "lift" } });
  }
  if (wantsPlace) {
    actions.push({ name: "move_arm", args: { pose: "pre_place" } });
    actions.push({ name: "open_gripper" });
  }
  if (!actions.length) {
    return {
      reply:
        "I can move, rotate, position the arm and open or close the gripper. " +
        "Try: “Move to the table and pick up the blue box.”",
      actions: [],
    };
  }

  const described = actions.map((a) => {
    switch (a.name) {
      case "move": return `drive to the ${String(a.args?.to).replace(/_/g, " ")}`;
      case "rotate": return `rotate ${a.args?.degrees}°`;
      case "move_arm": return `move the arm to ${String(a.args?.pose).replace(/_/g, " ")}`;
      case "close_gripper": return "close the gripper";
      case "open_gripper": return "open the gripper";
      default: return a.name.replace(/_/g, " ");
    }
  });
  return {
    reply: `I'll ${described.join(", then ")}.`,
    actions,
  };
}

/** A placeholder camera frame — an SVG data URI so nothing is fetched. */
function mockFrame(caption: string, tick: number): string {
  const x = 150 + Math.round(Math.sin(tick / 3) * 60);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1b2430"/><stop offset="100%" stop-color="#0d1219"/>
    </linearGradient></defs>
    <rect width="640" height="360" fill="url(#g)"/>
    <rect x="0" y="270" width="640" height="90" fill="#232f3d"/>
    <rect x="380" y="212" width="150" height="58" rx="4" fill="#3a4a5e"/>
    <rect x="${x}" y="196" width="46" height="46" rx="5" fill="#3b82f6"/>
    <rect x="${x - 26}" y="238" width="98" height="34" rx="6" fill="#4b5b70"/>
    <circle cx="${x - 4}" cy="272" r="11" fill="#2b3644"/>
    <circle cx="${x + 50}" cy="272" r="11" fill="#2b3644"/>
    <text x="16" y="28" fill="#8fa3bd" font-family="ui-monospace,monospace" font-size="14">
      isaac-sim / camera_0 — MOCK</text>
    <text x="16" y="346" fill="#6b7f99" font-family="ui-monospace,monospace" font-size="13">
      ${caption}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createMockBackend(): Backend {
  let emit: ((e: BackendEvent) => void) | null = null;
  let cancelled = false;
  let frameTimer: number | undefined;
  let tick = 0;
  let caption = "idle";

  return {
    label: "mock (no endpoint configured)",

    connect(onEvent) {
      emit = onEvent;
      cancelled = false;
      onEvent({ type: "connection", connected: true });
      onEvent({ type: "status", state: "idle" });
      // A steady frame rate so the video panel is visibly live, not a photo.
      frameTimer = window.setInterval(() => {
        onEvent({ type: "frame", src: mockFrame(caption, tick++) });
      }, 120);
      return () => {
        cancelled = true;
        emit = null;
        if (frameTimer) window.clearInterval(frameTimer);
        onEvent({ type: "connection", connected: false });
      };
    },

    sendInstruction(text) {
      const send = emit;
      if (!send) return;
      cancelled = false;

      void (async () => {
        const id = nextId();
        const { reply, actions } = planActions(text);

        send({ type: "status", state: "thinking" });
        await wait(320);

        // Stream the reply so the UI's streaming path is exercised now
        // rather than discovered when the real agent streams.
        send({ type: "assistant_start", id });
        for (const word of reply.split(" ")) {
          if (cancelled) return;
          send({ type: "assistant_delta", id, text: word + " " });
          await wait(38);
        }
        send({ type: "assistant_end", id });

        for (const a of actions) {
          if (cancelled) return;
          send({ type: "action", id, action: a });
        }
        if (!actions.length) {
          send({ type: "status", state: "idle" });
          return;
        }

        for (const a of actions) {
          if (cancelled) return;
          caption = `${a.name} — running`;
          send({ type: "status", state: "executing", action: a });
          await wait(1100);
        }
        if (cancelled) return;
        caption = "task complete";
        send({ type: "status", state: "done", detail: `${actions.length} actions completed` });
        await wait(1400);
        if (cancelled) return;
        caption = "idle";
        send({ type: "status", state: "idle" });
      })();
    },

    abort() {
      cancelled = true;
      caption = "aborted";
      emit?.({ type: "status", state: "idle", detail: "aborted by operator" });
    },
  };
}
