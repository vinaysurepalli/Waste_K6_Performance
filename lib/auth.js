// lib/auth.js
export function ensureBearer(tokenOrJwt) {
  if (!tokenOrJwt) return "";
  const t = String(tokenOrJwt).trim().replace(/^['"]|['"]$/g, "");
  if (/^Bearer\s+/i.test(t)) return t;
  return `Bearer ${t}`;
}

function b64urlToJson(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
    + '==='.slice((b64url.length + 3) % 4);
  const str = String.fromCharCode(...Array.from(atob(b64)).map(c => c.charCodeAt(0)));
  return JSON.parse(str);
}

export function debugToken(token) {
  if (!token) { console.log("[AUTH] No token"); return; }
  const raw = token.startsWith("Bearer ") ? token.slice(7) : token;
  const parts = raw.split('.');
  if (parts.length !== 3) { console.log("[AUTH] Not a JWT"); return; }
  const header = b64urlToJson(parts[0]);
  const payload = b64urlToJson(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  const expIn = payload.exp ? (payload.exp - now) : null;

  console.log(`[AUTH] iss=${payload.iss} | aud=${payload.aud} | expIn=${expIn}s | sub=${payload.sub || ''}`);
}
