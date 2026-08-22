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
import type { Backend } from "./types";

const url = import.meta.env.VITE_OPENCLAW_URL as string | undefined;

export function createBackend(): Backend {
  if (url) {
    // Deliberately not silently falling back to the mock here. If an endpoint
    // was configured and cannot be used, that should be loud — a demo quietly
    // running on fake data while everyone believes it is live is the worst
    // possible failure.
    throw new Error(
      `VITE_OPENCLAW_URL is set to "${url}" but realBackend.ts does not exist yet. ` +
        `Implement it against the Backend interface in types.ts, or unset the ` +
        `variable to run on the mock.`
    );
  }
  return createMockBackend();
}
