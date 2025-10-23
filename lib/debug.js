// lib/debug.js
function b64urlToJson(b64url) {
  // base64url -> base64
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
    + '==='.slice((b64url.length + 3) % 4);
  // decode + parse
  const str = String.fromCharCode(...Array.from(atob(b64)).map(c => c.charCodeAt(0)));
  return JSON.parse(str);
}

/**
 * Print key JWT fields to help debug audience/issuer/expiry mismatches.
 * Accepts either a raw JWT or "Bearer <JWT>".
 */
export function debugToken(token) {
  if (!token) { console.log("[AUTH] No token present"); return; }
  const raw = token.startsWith("Bearer ") ? token.slice(7) : token;
  const parts = raw.split('.');
  if (parts.length !== 3) { console.log("[AUTH] Not a JWT"); return; }

  let header, payload;
  try {
    header = b64urlToJson(parts[0]);
    payload = b64urlToJson(parts[1]);
  } catch (e) {
    console.log(`[AUTH] Failed to decode JWT: ${e}`);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const expIn = typeof payload.exp === 'number' ? (payload.exp - now) : null;

  console.log(
    `[AUTH] kid=${header.kid || ''} typ=${header.typ || ''} alg=${header.alg || ''} | `
    + `iss=${payload.iss || ''} | aud=${payload.aud || ''} | `
    + `tid=${payload.tid || payload.tid || ''} | `
    + `sub=${payload.sub || ''} | `
    + `expIn=${expIn !== null ? expIn + 's' : 'n/a'}`
  );
}
