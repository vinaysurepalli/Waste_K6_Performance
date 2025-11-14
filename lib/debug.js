// lib/debug.js
import { b64decode } from "k6/encoding";

function decodeJwtPart(part) {
  try {
    // base64url → base64
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") +
      "===".slice((part.length + 3) % 4);

    const bytes = b64decode(b64);          // ArrayBuffer / Uint8Array
    const str = new TextDecoder("utf-8").decode(bytes);
    return JSON.parse(str);
  } catch (e) {
    console.log(`[AUTH] Failed to decode part: ${String(e)}`);
    return null;
  }
}

export function debugToken(token) {
  if (!token) {
    console.log("[AUTH] No token");
    return;
  }

  const raw = token.startsWith("Bearer ") ? token.slice(7) : token;
  const parts = raw.split(".");
  if (parts.length !== 3) {
    console.log("[AUTH] Not a JWT (expected 3 parts)");
    return;
  }

  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  if (!payload) {
    console.log("[AUTH] Could not decode JWT payload");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const expIn = payload.exp ? payload.exp - now : null;

  console.log(`[AUTH] header=${JSON.stringify(header)}`);
  console.log(
    `[AUTH] iss=${payload.iss} | aud=${payload.aud} | expIn=${expIn}s | ` +
    `sub=${payload.sub || ""} | scope=${payload.scope || ""}`
  );
}
