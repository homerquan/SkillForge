/**
 * localStorage-backed device token store, matching
 * `GatewayBrowserDeviceTokenStore` from `@openclaw/gateway-client/browser`.
 * Persists the server-issued device token + granted scopes per
 * (clientId, deviceId, role) so reconnects reuse the approved pairing
 * instead of triggering a new pairing request every time.
 */

import type { GatewayBrowserDeviceTokenStore } from "@openclaw/gateway-client/browser";

const key = (clientId: string, deviceId: string, role: string) =>
  `openclaw.deviceToken.v1:${clientId}:${deviceId}:${role}`;

export const deviceTokenStore: GatewayBrowserDeviceTokenStore = {
  load({ clientId, deviceId, role }) {
    const raw = localStorage.getItem(key(clientId, deviceId, role));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  store({ clientId, deviceId, role, token, scopes }) {
    localStorage.setItem(key(clientId, deviceId, role), JSON.stringify({ token, scopes }));
  },
  clear({ clientId, deviceId, role }) {
    localStorage.removeItem(key(clientId, deviceId, role));
  },
};
