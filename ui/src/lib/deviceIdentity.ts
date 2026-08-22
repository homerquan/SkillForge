/**
 * Browser device identity for OpenClaw Gateway device-paired auth.
 *
 * The gateway verifies device signatures as Ed25519 (confirmed by the
 * OpenClaw team against their server source). The identity must stay stable
 * across reconnects — regenerating the keypair on every load makes every
 * connection look like a brand-new device needing re-approval — so the
 * keypair and device id are generated once and persisted in localStorage.
 *
 * Matches the `GatewayBrowserDeviceIdentity` shape from
 * `@openclaw/gateway-client/browser`: `{ deviceId, publicKey, sign }`, where
 * `publicKey` is the raw public key, base64url-encoded, and `sign` returns a
 * base64url-encoded signature over a payload string.
 */

import type { GatewayBrowserDeviceIdentity } from "@openclaw/gateway-client/browser";

// v2: v1 stored a random UUID as deviceId, which the gateway rejects with
// "device identity mismatch". Bumping the key discards those stale pairs so
// a correctly-derived identity is generated on next load.
const STORAGE_KEY = "openclaw.deviceIdentity.v2";

type StoredIdentity = {
  deviceId: string;
  publicKeyB64Url: string;
  privateKeyB64Url: string; // pkcs8
};

function base64UrlEncode(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * The gateway derives the device id from the key itself and compares — it is
 * NOT a free-choice identifier. Server-side (src/infra/device-identity.ts):
 * base64url-normalize the public key, decode to raw bytes, SHA-256, hex.
 * Anything else fails the connect with "device identity mismatch".
 */
async function deriveDeviceId(publicKeyRaw: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", publicKeyRaw);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function generateAndStore(): Promise<StoredIdentity> {
  const keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const [publicKeyRaw, privateKeyPkcs8] = await Promise.all([
    crypto.subtle.exportKey("raw", keyPair.publicKey),
    crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  ]);
  const stored: StoredIdentity = {
    deviceId: await deriveDeviceId(publicKeyRaw),
    publicKeyB64Url: base64UrlEncode(publicKeyRaw),
    privateKeyB64Url: base64UrlEncode(privateKeyPkcs8),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return stored;
}

function loadStored(): StoredIdentity | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredIdentity>;
    if (!parsed.deviceId || !parsed.publicKeyB64Url || !parsed.privateKeyB64Url) return null;
    return parsed as StoredIdentity;
  } catch {
    return null;
  }
}

/** Loads the persisted device identity, generating one on first use. */
export async function loadDeviceIdentity(): Promise<GatewayBrowserDeviceIdentity> {
  let stored = loadStored() ?? (await generateAndStore());
  // Self-heal a stored pair whose id was not derived from its own key (a
  // stale identity from an older build, or hand-edited storage). Without
  // this the gateway rejects every connect and the only fix is clearing
  // site data by hand.
  const expectedId = await deriveDeviceId(base64UrlDecode(stored.publicKeyB64Url));
  if (stored.deviceId !== expectedId) {
    stored = await generateAndStore();
  }
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    base64UrlDecode(stored.privateKeyB64Url),
    { name: "Ed25519" },
    false,
    ["sign"]
  );
  return {
    deviceId: stored.deviceId,
    publicKey: stored.publicKeyB64Url,
    async sign(payload: string) {
      const signature = await crypto.subtle.sign(
        "Ed25519",
        privateKey,
        new TextEncoder().encode(payload)
      );
      return base64UrlEncode(signature);
    },
  };
}
