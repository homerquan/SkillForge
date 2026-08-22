/**
 * Backend selection — the single swap point.
 *
 * With no endpoint configured the UI runs on the mock, so the demo always
 * works. To point at the real OpenClaw gateway, set both in
 * `ui/.env.local` (gitignored, never commit it — the token is a live secret):
 *
 *     VITE_OPENCLAW_URL=ws://<gateway-host>:<port>
 *     VITE_OPENCLAW_TOKEN=<gateway token>
 *
 * `realBackend.ts` implements the same `Backend` interface. No component
 * imports either implementation directly.
 */

import { createMockBackend } from "./mockBackend";
import { createRealBackend } from "./realBackend";
import type { Backend } from "./types";

const url = import.meta.env.VITE_OPENCLAW_URL as string | undefined;
const token = import.meta.env.VITE_OPENCLAW_TOKEN as string | undefined;

export function createBackend(): Backend {
  if (url) {
    // Deliberately not silently falling back to the mock here. If an endpoint
    // was configured and cannot be used, that should be loud — a demo quietly
    // running on fake data while everyone believes it is live is the worst
    // possible failure.
    if (!token) {
      throw new Error(
        `VITE_OPENCLAW_URL is set but VITE_OPENCLAW_TOKEN is not. Add both to .env.local.`
      );
    }
    return createRealBackend(url, token);
  }
  return createMockBackend();
}
