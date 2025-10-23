import { defaultOptions } from "../lib/options.js";
import { loadCsv, rowForVu } from "../lib/csv.js";
import { ensureBearer } from "../lib/auth.js";
import { req } from "../lib/http.js";
import { withRetry } from "../lib/backoff.js";
import { logKV, warn, err } from "../lib/logger.js";
import { Rate, Trend } from "k6/metrics";
import { check, sleep } from "k6";
import { debugToken } from "../lib/debug.js";
import { b64decode } from "k6/encoding";
import exec from "k6/execution";
import http from "k6/http";

// Client configs
import icelandCfg from "../config/iceland.config.js";
import krogerCfg from "../config/kroger.config.js";
import hebCfg from "../config/heb.config.js";

// Optional Pyroscope – static import; guard the call later
import pyroscope from "https://jslib.k6.io/http-instrumentation-pyroscope/1.0.1/index.js";

/* -------------------- .env loader (local-only convenience) -------------------- */
function loadDotEnv(path = "./.env") {
  try {
    const raw = open(path);
    raw.split(/\r?\n/).forEach((line) => {
      if (!line || /^\s*#/.test(line)) return; // skip comments/blanks
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) return;
      const key = m[1];
      let val = m[2].replace(/^\s*['"]?|['"]?\s*$/g, "").replace(/^\uFEFF/, "").trim();
      if (!(__ENV[key])) __ENV[key] = val;
    });
  } catch (_) {
    // no .env – fine
  }
}
loadDotEnv();
/* ----------------------------------------------------------------------------- */

// simple, non-crypto checksum just for masked logging
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
}

function normalizeBearer(tok) {
  if (!tok) return "";
  let t = String(tok).trim();
  if (t.startsWith('"') || t.startsWith("'")) t = t.slice(1, -1);
  return /^Bearer\s+/i.test(t) ? t : `Bearer ${t}`;
}

function tokenDigest(bearer) {
  const t = String(bearer).split(/\s+/)[1] || "";
  return djb2(t);
}

function decodeJWT(bearer) {
  try {
    const [, jwt] = String(bearer).split(/\s+/);
    const [h, p] = jwt.split(".");
    const pad = (s) => s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const header = JSON.parse(b64decode(pad(h)));
    const claims = JSON.parse(b64decode(pad(p)));
    return { header, claims };
  } catch (e) {
    return null;
  }
}

// Choose client from env (default: iceland)
const CLIENT = String(__ENV.CLIENT || "iceland").toLowerCase();
const cfgMap = { iceland: icelandCfg, kroger: krogerCfg, heb: hebCfg };
const cfg = cfgMap[CLIENT] || icelandCfg;

// Token from configured env key (e.g. TOKEN)
const expectEnvKey = cfg.tokenEnv;
const rawFromEnv = String(__ENV[expectEnvKey] || "").trim();

if (rawFromEnv.includes("...")) {
  console.error(`[AUTH] The ${expectEnvKey} looks like a placeholder (contains '...'). Please paste the FULL token.`);
}

const TOKEN = ensureBearer(rawFromEnv);

// Load CSV (init is fine)
const rows = loadCsv(cfg.csvPath, cfg.csvFilter);

// Optional Pyroscope (init is fine)
if (String(__ENV.PYROSCOPE || "false").toLowerCase() === "true") {
  pyroscope.instrumentHTTP();
}

// Metrics & options
export const error_rate = new Rate(`${cfg.name}_error_rate`);
export const md_duration = new Trend(`${cfg.name}_markdown_req_duration`, true);

export const options = {
  ...defaultOptions,
  cloud: cfg.cloud,
  scenarios: {
    main: {
      executor: cfg.scenario.executor,
      startVUs: cfg.scenario.startVUs,
      stages: cfg.scenario.stages,
      gracefulRampDown: cfg.scenario.gracefulRampDown,
    },
  },
};

console.log(
  `[BOOT] client=${CLIENT} csv=${cfg.csvPath} ramp=${cfg.scenario?.startVUs}->${cfg.scenario?.stages?.slice(-1)?.[0]?.target ?? "?"}`
);

// Retry wrapper: retry on 408/429/5xx
const postWithRetry = withRetry(
  (url, body, headers) => {
    const res = req("POST", url, body, headers); // lib/http.js should JSON.stringify if body is object
    if (!res) return null;
    if ([408, 429].includes(res.status) || (res.status >= 500 && res.status <= 599)) return null;
    return res;
  },
  {
    tries: Number(__ENV.RETRY_TRIES || 4),
    baseMs: Number(__ENV.RETRY_BASE_MS || 250),
    jitter: true,
  }
);

export default function () {
  // one-time early auth diagnostics (first VU first iter)
  const isFirstIter = exec.vu.idInTest === 1 && exec.scenario.iterationInTest === 0;

  if (isFirstIter) {
    const shownHead = rawFromEnv.slice(0, 16);
    const shownTail = rawFromEnv.slice(-16);
    console.log(`[AUTH] using env key=${expectEnvKey}`);
    console.log(`[AUTH] rawLen=${rawFromEnv.length} head='${shownHead}' tail='${shownTail}'`);
    console.log(`[AUTH] bearerLen=${TOKEN.length}`);
    if (TOKEN.length < 80) {
      console.error(`[AUTH] Token is too short. This will 401. Make sure .env has the FULL JWT on a single line.`);
    }
    const decodedEarly = decodeJWT(TOKEN);
    if (decodedEarly) {
      console.log(`[AUTH] iss=${decodedEarly.claims?.iss} aud=${decodedEarly.claims?.aud} exp=${decodedEarly.claims?.exp}`);
    } else {
      console.log(`[AUTH] JWT could not be decoded (probably truncated).`);
    }
  }

  // Optional token dump
  if ((String(__ENV.DEBUG_AUTH || "0") === "1") && isFirstIter) {
    debugToken(TOKEN);
  }

  if (!TOKEN) {
    err(`No token for ${cfg.name}. Provide -e ${cfg.tokenEnv}=<JWT or 'Bearer ...'> (or put it in .env)`);
    return;
  }
  if (!rows.length) {
    err(`No rows loaded for ${cfg.name}. Check CSV at: ${cfg.csvPath}`);
    return;
  }

  // Show masked token summary once
  if (isFirstIter) {
    const bearer = normalizeBearer(__ENV[cfg.tokenEnv]);
    const dig = tokenDigest(bearer);
    const decoded = decodeJWT(bearer);
    console.log(`[AUTH] tokenLen=${bearer.length} digest=${dig}`);
    if (decoded) {
      console.log(`[AUTH] iss=${decoded.claims?.iss} aud=${decoded.claims?.aud} exp=${decoded.claims?.exp}`);
    } else {
      console.log(`[AUTH] could not decode JWT`);
    }
  }

  const row = rowForVu(rows);
  const payload = cfg.buildPayload(row);

  const headers = {
    Authorization: TOKEN,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(typeof cfg.extraHeaders === "function" ? cfg.extraHeaders() : (cfg.extraHeaders || {})),
  };

  // Low-level one-shot request dump (first iter or DEBUG_HTTP=1)
  if (isFirstIter || String(__ENV.DEBUG_HTTP || "0") === "1") {
    const url = cfg.apiUrl;
    const dbgHeaders = {
      ...headers,
      "Accept-Encoding": "identity",
      ...(cfg.extraHeaders || {}),
    };
    const params = { headers: dbgHeaders, redirects: 0, timeout: "30s" };
    const dbgRes = http.post(url, JSON.stringify(payload), params);

    console.log(`[REQ] ${url}`);
    console.log(`[REQ] headers=${JSON.stringify({ ...dbgHeaders, Authorization: "Bearer ***masked***" })}`);
    console.log(`[RES] status=${dbgRes.status} loc=${dbgRes.headers?.Location || ""}`);
    console.log(`[RES] bodyFirst200=${String(dbgRes.body || "").slice(0, 200)}`);
    // return; // uncomment to only run the debug call
  }

  const t0 = Date.now();
  const res = postWithRetry(cfg.apiUrl, payload, headers);
  md_duration.add(Date.now() - t0);

  if (!res) {
    error_rate.add(1);
    warn(`[${cfg.name}] POST failed after retries`);
    return;
  }

  const ok = check(res, { "status is 200/201": (r) => r.status === 200 || r.status === 201 });
  if (!ok) {
    error_rate.add(1);
    logKV(`[${cfg.name}] Non-OK`, { status: res.status, body: String(res.body).slice(0, 1200) });
  }

  const minMs = Number(__ENV.SLEEP_MIN_MS || 100);
  const maxMs = Number(__ENV.SLEEP_MAX_MS || 200);
  sleep((Math.random() * (maxMs - minMs) + minMs) / 1000);
}
