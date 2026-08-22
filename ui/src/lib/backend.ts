/**
 * Backend selection — the single swap point.
 *
 * With no endpoint configured the UI runs on the mock, so the demo always
 * works. When a teammate provides the OpenClaw endpoint, put it in
 * `ui/.env.local` (gitignored, never commit it) and nothing else changes:
 *
 *     VITE_OPENCLAW_URL=ws://<gb10-address>:<port>
 *
 * The real implementation goes in `realBackend.ts` against the same `Backend`
 * interface. No component imports either implementation directly.
 */

import { createMockBackend } from "./mockBackend";
import { createRealBackend } from "./realBackend";
import type { Backend } from "./types";

const url = import.meta.env.VITE_SKILLFORGE_BRIDGE_URL as string | undefined;

export function createBackend(): Backend {
  if (url) {
    return createRealBackend(url);
  }
  return createMockBackend();
}
