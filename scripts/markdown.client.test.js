// tests/markdown.client.test.js
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
import woolworthsCfg from "../config/woolworths.config.js";
import eastofenglandCfg from "../config/eastofengland.config.js";
import albertsonsCfg from "../config/albertsons.config.js";
import homebargainCfg from "../config/homebargain.config.js";
import centralenglandCfg from "../config/centralengland.config.js";
import midcountiesCfg from "../config/midcounties.config.js";
import southernCfg from "../config/southern.config.js";
import scotmidCfg from "../config/scotmid.config.js";
import loblawConfig from "../config/loblaw.config.js";


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

// simple masked checksum
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
const cfgMap = {
  iceland: icelandCfg,
  kroger: krogerCfg,
  heb: hebCfg,
  woolworths: woolworthsCfg,
  eastofengland: eastofenglandCfg,
  albertsons: albertsonsCfg,
  homebargain: homebargainCfg,
  centralengland: centralenglandCfg,
  midcounties: midcountiesCfg,
  southern: southernCfg,
  scotmid: scotmidCfg,
  loblaw: loblawConfig,
};
const cfg = cfgMap[CLIENT] || icelandCfg;

// Which operation(s) to run this iteration: markdown | prompted | both
const WHICH_OP = String(__ENV.OP || "both").toLowerCase();
const shouldRun = (key) => WHICH_OP === "both" || WHICH_OP === key;

// Token from configured env key (e.g. TOKEN_CENTRALENGLAND)
const expectEnvKey = cfg.tokenEnv;
const rawFromEnv = String(__ENV[expectEnvKey] || "").trim();
if (rawFromEnv.includes("...")) {
  console.error(`[AUTH] The ${expectEnvKey} looks like a placeholder (contains '...'). Paste the FULL token.`);
}
const TOKEN = ensureBearer(rawFromEnv);

// Load CSV (init is fine)
const rows = loadCsv(cfg.csvPath, cfg.csvFilter);

// Optional Pyroscope
if (String(__ENV.PYROSCOPE || "false").toLowerCase() === "true") {
  pyroscope.instrumentHTTP();
}

// Metrics & options
export const error_rate = new Rate(`${cfg.name}_error_rate`);
export const md_duration = new Trend(`${cfg.name}_req_duration`, true);
// Per-op trends
const opTrends = {};
if (Array.isArray(cfg.operations)) {
  cfg.operations.forEach((op) => {
    opTrends[op.key] = new Trend(`${cfg.name}_${op.key}_duration`, true);
  });
}

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
  const isFirstIter = exec.vu.idInTest === 1 && exec.scenario.iterationInTest === 0;

  if (isFirstIter) {
    const shownHead = rawFromEnv.slice(0, 16);
    const shownTail = rawFromEnv.slice(-16);
    console.log(`[AUTH] using env key=${expectEnvKey}`);
    console.log(`[AUTH] rawLen=${rawFromEnv.length} head='${shownHead}' tail='${shownTail}'`);
    console.log(`[AUTH] bearerLen=${TOKEN.length}`);
    if (TOKEN.length < 80) {
      console.error(`[AUTH] Token is too short. This will 401. Ensure FULL JWT on one line.`);
    }
    const decodedEarly = decodeJWT(TOKEN);
    if (decodedEarly) {
      console.log(`[AUTH] iss=${decodedEarly.claims?.iss} aud=${decodedEarly.claims?.aud} exp=${decodedEarly.claims?.exp}`);
    } else {
      console.log(`[AUTH] JWT could not be decoded (probably truncated).`);
    }
  }

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

  // Masked token summary once
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

  // Single row feeds all ops in this iteration
  const row = rowForVu(rows);

  // Execute requested operations in order
  for (const op of (cfg.operations || [])) {
    if (!shouldRun(op.key)) continue;

    const headers = {
      Authorization: TOKEN,
      Accept: "application/json",
      "Content-Type": op.contentType || "application/json",
      "Accept-Encoding": "identity",
      ...(typeof cfg.extraHeaders === "function" ? cfg.extraHeaders() : (cfg.extraHeaders || {})),
      ...(op.extraHeaders || {}),
    };

    const body = op.buildPayload(row);

    // One-shot low-level request dump for the first op on first iter (or DEBUG_HTTP=1)
    const doDebugDump = isFirstIter || String(__ENV.DEBUG_HTTP || "0") === "1";
    if (doDebugDump) {
      const params = { headers, redirects: 0, timeout: "30s" };
      const dbgRes = http.post(op.url, JSON.stringify(body), params);
      console.log(`[REQ] ${op.key} -> ${op.url}`);
      console.log(`[REQ] headers=${JSON.stringify({ ...headers, Authorization: "Bearer ***masked***" })}`);
      console.log(`[RES] status=${dbgRes.status} loc=${dbgRes.headers?.Location || ""}`);
      console.log(`[RES] bodyFirst200=${String(dbgRes.body || "").slice(0, 200)}`);
      // comment out the next line if you want to skip the normal flow on first iter
      // continue;
    }

    const t0 = Date.now();
    const res = postWithRetry(op.url, body, headers);
    opTrends[op.key]?.add(Date.now() - t0);
    md_duration.add(Date.now() - t0);

    if (!res) {
      error_rate.add(1);
      warn(`[${cfg.name}] ${op.key} POST failed after retries`);
      continue;
    }

    const ok = check(res, { [`${op.key} status 200/201`]: (r) => r.status === 200 || r.status === 201 });
    if (!ok) {
      error_rate.add(1);
      logKV(`[${cfg.name}] Non-OK ${op.key}`, { status: res.status, body: String(res.body).slice(0, 1200) });
    }

    // think time between ops
    const minMs = Number(__ENV.SLEEP_MIN_MS || cfg.think?.minMs || 500);
    const maxMs = Number(__ENV.SLEEP_MAX_MS || cfg.think?.maxMs || 1500);
    sleep((Math.random() * (maxMs - minMs) + minMs) / 1000);
  }
}
