import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { env } from "../config/env.js";

// ENCRYPTION_KEY is validated as 32 bytes of base64 in env.ts.
const KEY = Buffer.from(env.ENCRYPTION_KEY, "base64");
const IV_BYTES = 12; // 96-bit IV is the GCM standard.
const AUTH_TAG_BYTES = 16;

/**
 * AES-256-GCM. Output format: `iv.authTag.ciphertext`, each base64url.
 * Use for at-rest secrets like OAuth access/refresh tokens.
 */
export function encryptString(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64url")).join(".");
}

export function decryptString(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext");
  }
  const [iv, authTag, ciphertext] = parts.map((p) => Buffer.from(p, "base64url"));
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("Malformed ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Signs an OAuth state nonce with HMAC-SHA256. Format:
 *   `payload.signature` where payload is base64url(JSON({ sub, ts }))
 * and signature is base64url(HMAC). TTL is enforced on verify.
 *
 * `sub` is the coach's user id. The signature prevents an attacker from
 * forging a state that swaps in their own id (which would attach the
 * resulting Google account to the attacker's row).
 */
const STATE_TTL_MS = 10 * 60 * 1000;
const HMAC_KEY = createHmac("sha256", KEY).update("state-hmac-v1").digest();

export function signState(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub, ts: Date.now() }), "utf8").toString("base64url");
  const signature = createHmac("sha256", HMAC_KEY).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyState(state: string): { sub: string } {
  const parts = state.split(".");
  if (parts.length !== 2) {
    throw new Error("Malformed state");
  }
  const [payload, signature] = parts;
  const expected = createHmac("sha256", HMAC_KEY).update(payload).digest("base64url");
  const a = Buffer.from(signature, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid state signature");
  }
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    sub: string;
    ts: number;
  };
  if (typeof decoded.sub !== "string" || typeof decoded.ts !== "number") {
    throw new Error("Malformed state payload");
  }
  if (Date.now() - decoded.ts > STATE_TTL_MS) {
    throw new Error("State expired");
  }
  return { sub: decoded.sub };
}
