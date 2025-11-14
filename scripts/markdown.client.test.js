// scripts/markdown.client.test.js
import { defaultOptions } from "../lib/options.js";
import { loadCsv, rowForVu } from "../lib/csv.js";
import { req } from "../lib/http.js";
import { withRetry } from "../lib/backoff.js";
import { logKV, warn, err } from "../lib/logger.js";
import { Rate, Trend } from "k6/metrics";
import { check, sleep, group } from "k6";
import { ensureBearer } from "../lib/auth.js";
import { debugToken } from "../lib/debug.js";

// Client configs
import icelandCfg from "../config/iceland.config.js";
import albertsonsConfig from "../config/albertsons.config.js";
import centralenglandConfig from "../config/centralengland.config.js";
import eastofenglandConfig from "../config/eastofengland.config.js";
import hebConfig from "../config/heb.config.js";
import homebargainConfig from "../config/homebargain.config.js";
import krogerConfig from "../config/kroger.config.js";
import loblawConfig from "../config/loblaw.config.js";
import midcountiesConfig from "../config/midcounties.config.js";
import scotmidConfig from "../config/scotmid.config.js";
import southernConfig from "../config/southern.config.js";
import woolworthsConfig from "../config/woolworths.config.js";


// Optional Pyroscope
import pyroscope from "https://jslib.k6.io/http-instrumentation-pyroscope/1.0.1/index.js";


/* ---------- .env loader ---------- */
function loadDotEnv(path = "./.env") {
  try {
    const raw = open(path);
    raw.split(/\r?\n/).forEach((line) => {
      if (!line || /^\s*#/.test(line)) return;
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) return;
      const key = m[1];
      let val = m[2].replace(/^\s*['"]?|['"]?\s*$/g, "").replace(/^\uFEFF/, "").trim();
      if (!(__ENV[key])) __ENV[key] = val;
    });
  } catch (_) {}
}
loadDotEnv();
/* --------------------------------- */

// simple masked checksum
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
}
function normalizeBearer(tok) {
  if (!tok) return "";
  let t = String(tok).trim();
  if (t.startsWith('"') || t.startsWith("'")) t = t.slice(1, -1).trim();
  return /^Bearer\s+/i.test(t) ? t : `Bearer ${t}`;
}
function tokenDigest(bearer) {
  const t = String(bearer).split(/\s+/)[1] || "";
  return djb2(t);
}

// Choose client 
const CLIENT = String(__ENV.CLIENT || "iceland").toLowerCase();
const cfgMap = { 
  iceland: icelandCfg,
  albertsons: albertsonsConfig, 
  centralengland: centralenglandConfig,
  eastofengland: eastofenglandConfig,
  heb: hebConfig,
  homebargain: homebargainConfig,
  kroger: krogerConfig,
  loblaw: loblawConfig,
  midcounties: midcountiesConfig,
  scotmid: scotmidConfig,
  southern: southernConfig,
  woolworths: woolworthsConfig 
};
const cfg = cfgMap[CLIENT] || icelandCfg;

// Which operation(s) to run
const WHICH_OP = String(__ENV.OP || "markdown").toLowerCase();
const shouldRun = (key) => WHICH_OP === "both" || WHICH_OP === key;

// Token
const expectEnvKey = cfg.tokenEnv;          // "TOKEN_ICELAND"
const rawFromEnv = String(__ENV[expectEnvKey] || "").trim();
const TOKEN = ensureBearer(rawFromEnv);

// Data
const rows = loadCsv(cfg.csvPath, cfg.csvFilter);

// Optional Pyroscope
if (String(__ENV.PYROSCOPE || "false").toLowerCase() === "true") {
  pyroscope.instrumentHTTP();
}

// Metrics & thresholds
export const error_rate = new Rate(`${cfg.name}_error_rate`);
export const md_duration = new Trend(`${cfg.name}_req_duration`, true);

const OP_P95_MS = Number(__ENV.OP_P95_MS || 200);
const thresholds = {
  http_req_failed: ["rate<0.05"],
  http_req_duration: ["p(95)<2000"],
  [`${cfg.name}_req_duration`]: ["p(95)<2000"],
};

const opTrends = {};
if (Array.isArray(cfg.operations)) {
  cfg.operations.forEach((op) => {
    const trendName = `${cfg.name}_${op.key}_duration`;
    opTrends[op.key] = new Trend(trendName, true);
    thresholds[trendName] = [`p(95)<${OP_P95_MS}`];
  });
}

// k6 options
export const options = {
  ...defaultOptions,
  cloud: cfg.cloud,
  systemTags: Array.from(
    new Set([
      ...(defaultOptions.systemTags || []),
      "status",
      "method",
      "name",
      "group",
      "check",
      "error",
    ])
  ),
  scenarios: {
    main: {
      executor: cfg.scenario.executor,
      startVUs: cfg.scenario.startVUs,
      stages: cfg.scenario.stages,
      gracefulRampDown: cfg.scenario.gracefulRampDown,
    },
  },
  thresholds,
};

console.log(
  `[BOOT] client=${CLIENT} csv=${cfg.csvPath} ramp=${cfg.scenario?.startVUs}->${cfg.scenario?.stages?.slice(-1)?.[0]?.target ?? "?"}`
);

// Retry wrapper
const postWithRetry = withRetry(
  (url, body, opts) => {
    const res = req("POST", url, body, opts);
    if (!res) return null;
    if ([408, 429].includes(res.status) || (res.status >= 500 && res.status <= 599)) return null;
    return res;
  },
  { tries: Number(__ENV.RETRY_TRIES || 4), baseMs: Number(__ENV.RETRY_BASE_MS || 250), jitter: true }
);

export default function () {
  const isFirstIter = __VU === 1 && __ITER === 0;

  if (isFirstIter) {
    const shownHead = rawFromEnv.slice(0, 16);
    const shownTail = rawFromEnv.slice(-16);
    console.log(`[AUTH] using env key=${expectEnvKey}`);
    console.log(`[AUTH] rawLen=${rawFromEnv.length} head='${shownHead}' tail='${shownTail}'`);
    console.log(`[AUTH] bearerLen=${TOKEN.length}`);

    const hasCtrl = /[\x00-\x1F\x7F]/.test(rawFromEnv);
    if (hasCtrl) {
      console.error(
        "[AUTH] Token contains control characters (CR/LF/TAB etc). Fix your CLI or .env so it’s one clean line."
      );
    }

    debugToken(TOKEN); // logs iss / aud / expIn
  }

  if (!TOKEN) {
    err(`No token for ${cfg.name}. Provide -e ${cfg.tokenEnv}=<JWT or 'Bearer ...'>`);
    return;
  }
  if (!rows.length) {
    err(`No rows loaded for ${cfg.name}. Check CSV at: ${cfg.csvPath}`);
    return;
  }

  if (isFirstIter) {
    const bearer = normalizeBearer(__ENV[cfg.tokenEnv]);
    const dig = tokenDigest(bearer);
    console.log(`[AUTH] tokenLen=${bearer.length} digest=${dig}`);
  }

  const row = rowForVu(rows);

  for (const op of cfg.operations || []) {
    if (!shouldRun(op.key)) continue;

    group(op.key, () => {
      const bearerFinal = TOKEN; // already normalized

      const headers = {
        Authorization: bearerFinal,
        Accept: "application/json",
        "Content-Type": op.contentType || "application/json",
        "Accept-Encoding": "identity",
        ...(typeof cfg.extraHeaders === "function"
          ? cfg.extraHeaders()
          : cfg.extraHeaders || {}),
        ...(op.extraHeaders || {}),
      };

      const body = op.buildPayload(row);

      const t0 = Date.now();
      const res = postWithRetry(op.url, body, {
        headers,
        name: op.key,
        timeout: "30s",
        redirects: 5,
      });
      const elapsed = Date.now() - t0;

      opTrends[op.key]?.add(elapsed);
      md_duration.add(elapsed);

      const ok = check(res, {
        [`${op.key} status 200/201`]: (r) => r && (r.status === 200 || r.status === 201),
      });

      if (!ok) {
        error_rate.add(1);
        logKV(`[${cfg.name}] Non-OK ${op.key}`, {
          status: res?.status,
          body: String(res?.body || "").slice(0, 200),
        });
      }

      sleep(Math.random() * 1.5 + 0.5);
    });
  }
}
