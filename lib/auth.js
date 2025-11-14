

// lib/auth.js
export function ensureBearer(raw) {
  if (!raw) return "";
  // strip BOM + trim
  let t = String(raw).replace(/^\uFEFF/, "").trim();

  // strip surrounding quotes if present
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }

  // remove control chars (CR/LF/TAB etc.)
  t = t.replace(/[\x00-\x1F\x7F]/g, "");
  // collapse multiple spaces
  t = t.replace(/\s+/g, " ");

  if (!/^Bearer\s+/i.test(t)) t = `Bearer ${t}`;
  return t;
}

