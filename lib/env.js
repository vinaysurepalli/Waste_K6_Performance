// lib/env.js
// Minimal .env loader for k6 that works locally. Avoid using this for secrets in k6 Cloud.

function normalizeBearer(val) {
  if (!val) return val;
  let t = String(val).trim();
  // strip surrounding quotes
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1);
  }
  // collapse whitespace and strip invisible chars
  t = t.replace(/\r/g, '').replace(/\n/g, '').replace(/\u200B/g, '').trim();
  if (!/^Bearer\s+/i.test(t)) t = `Bearer ${t}`;
  return t;
}

export function loadEnv() {
  const candidates = [
    // repo root relative to tests/ (adjust if your folders differ)
    import.meta.resolve('../.env'),
    // alongside the test
    import.meta.resolve('./.env'),
    // last resort relative to CWD (current k6 behavior)
    '.env',
  ];

  let loadedFrom = null;
  for (const p of candidates) {
    try {
      const raw = open(p); // causes k6 to bundle the file
      raw.split(/\r?\n/).forEach((line) => {
        // KEY=VALUE (ignore comments and blanks)
        if (/^\s*#/.test(line) || /^\s*$/.test(line)) return;
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) return;
        const key = m[1];
        let val = m[2];

        // remove inline comments after value if value is unquoted
        if (!/^['"]/.test(val)) val = val.replace(/\s+#.*$/, '');

        // trim quotes/spaces/newlines
        val = val.trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        // only set if not already provided by CLI/OS
        if (__ENV[key] === undefined || __ENV[key] === '') {
          __ENV[key] = val;
        }
      });
      loadedFrom = p;
      break;
    } catch (_) {
      // file not found, try next
    }
  }

  // Normalize TOKEN if present
  if (__ENV.TOKEN) {
    __ENV.TOKEN = normalizeBearer(__ENV.TOKEN);
  }

  // Optional: quick boot log (mask token)
  const tokPreview = __ENV.TOKEN ? (__ENV.TOKEN.slice(0, 16) + '…') : '(none)';
  console.log(`[ENV] loaded from: ${loadedFrom || 'none'} | CLIENT=${__ENV.CLIENT || '(unset)'} | CSV=${__ENV.CSV || '(unset)'} | TOKEN=${tokPreview}`);
}
