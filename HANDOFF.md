# SkillForge — UI Handoff

Everything needed to pick this up cold, in Cursor or anywhere else.
Written 22 Aug 2026.

---

## 1. Your job

**You own the Web UI.** Three teammates own OpenClaw (the agent layer). One of
them will send you an **endpoint** to point the UI at.

Instructions from the standup:

- Build the UI **now, against mock data** — do not wait for the endpoint.
- The **conversation must genuinely work**. That is the part being judged.
- The **video panel can be a mock-up**. Real Isaac Sim video can come later.
- API specification is coming separately from a teammate.
- Stack: React is fine. Fully local deployment.

So the UI has to be real, and the video pane has to *look* real.

---

## 2. Where things are

| what | where |
|---|---|
| Repo (your Mac) | `~/Documents/Projects/SkillForge` |
| UI app | `~/Documents/Projects/SkillForge/ui` |
| Spec from Homer | `SPEC.md` (repo root) |
| GitHub | `github.com/homerquan/SkillForge` — **public** |
| GB10 (DGX Spark) | `ssh gb10` or `ssh team` |
| Repo on GB10 | `/home/dell/SkillForge` (capital S, capital F) |

### Running it

```bash
cd ~/Documents/Projects/SkillForge/ui
npm install
npm run dev
```

---

## 3. Environment facts worth knowing

**Your Mac is the right place to develop the UI.** It is a React app — it needs
Node and a browser, not a GPU. The GB10 is for Isaac Sim and ROS2, which is
your teammates' half.

**Git identity is clean on your Mac** (`sai-sidam <saikishore.slk@gmail.com>`,
authenticated via the `gh` CLI over https). Pushes from here are correctly
attributed to you.

**Git identity on the GB10 is NOT clean.** Everyone shares the `dell` Unix
account, the box's SSH key authenticates to GitHub as `homerquan`, and
`user.name`/`user.email` are unset. Anything committed from the box goes out
as Homer regardless of who typed it. There is no setting that is correct for
all of you, because you share one account.

> **Recommendation: commit from your Mac, use the GB10 for compute only.**
> This side-steps the whole problem.

**The GB10 is `aarch64` (ARM), not x86.** Relevant to your teammates for Isaac
Sim / ROS2 wheels; not relevant to the UI.

**The repo is PUBLIC.** Anything committed is world-readable. No keys, no
tokens, no datasets.

---

## 4. What SPEC.md asks for

```
Human text → Web UI → OpenClaw → structured actions → ROS2 → Isaac Sim
                ↑                                            │
                └──────── live camera + status ──────────────┘
```

Two-panel layout:

- **Left:** the human ↔ OpenClaw conversation.
- **Right:** live Isaac Sim camera, plus current action and robot status.

Robot action vocabulary — this is the whole set:

```
move()  rotate()  move_arm()  open_gripper()  close_gripper()
```

Success criterion, verbatim from the spec:

> A user can type **"Move to the table and pick up the blue box."**, OpenClaw
> generates the required ROS2 actions, Isaac Sim executes them, and the user
> watches the execution and status **live from the same web interface**.

---

## 5. What is already built

Vite + React + TypeScript scaffold in `ui/`, plus **the data layer, which is
the part with actual design decisions in it**:

### `ui/src/lib/types.ts` — the contract

The entire agreement between UI and backend. Components know nothing about the
backend beyond these types.

- `ActionName`, `RobotAction`, `formatAction()` — the five robot actions
- `RunState` — `idle | thinking | executing | done | error`
- `ChatMessage` — conversation entries, with `pending` for in-flight streaming
- `BackendEvent` — **the important one**, see below
- `Backend` — the interface any backend implements

### `ui/src/lib/mockBackend.ts` — a fake OpenClaw

Implements `Backend` with realistic *timing and shape*: streams the assistant
reply word by word, emits actions, then executes them one at a time with
status changes, and pushes ~8fps of generated SVG camera frames so the video
panel is visibly live rather than a still image.

Instruction parsing is deliberately shallow keyword matching. Do not improve
it — it is thrown away when the real agent lands. Its job is timing and event
shape, not language understanding.

### Why events, not request/response

`BackendEvent` is a **stream**, because the interesting things — the robot
executing, camera frames, status changes — arrive unprompted over a WebSocket.
A promise-shaped `sendInstruction(): Promise<Reply>` API would have to be torn
out the moment the real backend arrives. This shape survives the swap.

```ts
type BackendEvent =
  | { type: "connection";       connected: boolean }
  | { type: "assistant_start";  id: string }
  | { type: "assistant_delta";  id: string; text: string }   // streaming
  | { type: "assistant_end";    id: string }
  | { type: "action";           id: string; action: RobotAction }
  | { type: "status";           state: RunState; action?: RobotAction; detail?: string }
  | { type: "frame";            src: string }                // camera
  | { type: "error";            message: string }
```

---

## 6. What is left to build

1. **`ConversationPanel`** — message list, streaming assistant text, input box,
   inline display of the actions each turn produced.
2. **`RobotPanel`** — camera frame (`<img src={frame}>`), current status,
   current action via `formatAction()`, connection indicator.
3. **`App.tsx`** — still the default Vite template. Needs to hold state,
   subscribe to the backend, and reduce `BackendEvent`s into `ChatMessage[]` +
   status.
4. **`realBackend.ts`** — see section 7.
5. **Styling** — being done in Claude Design.

The reducer in (3) is the only fiddly part: `assistant_delta` events append to
the message with the matching `id`, and `assistant_end` clears its `pending`
flag.

---

## 7. Dropping in the real endpoint

**This should be a one-file change.** When your teammate sends the endpoint:

1. Create `ui/src/lib/realBackend.ts` implementing the same `Backend`
   interface — open a WebSocket, translate its messages into `BackendEvent`s.
2. Select it by environment variable so nothing else changes:

```ts
// ui/src/lib/backend.ts
import { createMockBackend } from "./mockBackend";
import { createRealBackend } from "./realBackend";

const url = import.meta.env.VITE_OPENCLAW_URL;
export const backend = url ? createRealBackend(url) : createMockBackend();
```

```bash
# ui/.env.local  — gitignored, never commit the endpoint
VITE_OPENCLAW_URL=ws://<gb10-address>:<port>
```

With no env var set it stays on the mock, so the demo always runs.

### Questions to ask the teammate about the API

Have these answered before writing `realBackend.ts`:

- WebSocket or SSE or plain HTTP?
- Does the assistant reply **stream**, or arrive whole? (The UI supports
  streaming; if it arrives whole, emit one `assistant_delta` and be done.)
- Are actions reported **when decided**, **when executed**, or both?
- How does the camera arrive — MJPEG stream, per-frame base64, WebRTC, or a
  plain URL the `<img>` can point at?
- Is there an abort/stop, and what does it look like?
- Session/auth: anything needed to connect, or open on the local network?

---

## 8. Open items

- **`team.md` does not exist yet.** Homer had it open in `vim` on the GB10 for
  ~20 minutes, unsaved — only a `.team.md.swp` swap file is on disk there.
  Do not delete that swap file; it holds his unsaved work.
- **`git ls-remote` on the GB10 works** (as `homerquan`) — the repo really was
  empty, it was not an auth failure.
- **"OpenClaw" is not a tool I could identify.** It may be your team's own
  agent layer or an internal name. If the UI is expected to integrate with a
  specific published SDK rather than a plain endpoint, confirm which — the
  design above assumes a plain endpoint, which is the safer assumption.

---

## 9. Suggested first move in Cursor

Open `~/Documents/Projects/SkillForge` and read, in this order:

1. `SPEC.md` — what is being built
2. `ui/src/lib/types.ts` — the contract, and the whole design in one file
3. `ui/src/lib/mockBackend.ts` — what the UI will be fed

Then build `App.tsx` + the two panels against the mock. When it looks right
against the mock, it will look right against the real agent.
