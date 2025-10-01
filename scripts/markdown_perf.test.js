import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import { htmlReport } from "https://jslib.k6.io/html-reporter/1.0.0/index.js";
import { jUnit } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

// ⬇️ new: load API config (URL + Bearer) from env or local file
import { loadApiConfig } from "../config/apiConfig.js";
const CLIENT = __ENV.CLIENT || "coop";
const { API_URL, API_TOKEN } = loadApiConfig(CLIENT);

// … keep the rest of your script the same …

// when you build request headers, just use:
const headers = {
  "Content-Type": "application/json",
  "Accept-Encoding": "*.*",
  Authorization: API_TOKEN,
};

// and post to API_URL as before
// http.post(API_URL, body, { headers, timeout: "15000ms" })

const ITEM_COUNT    = Math.max(1, Number(__ENV.ITEM_COUNT || 1));
const MARKDOWN_TYPE = __ENV.MARKDOWN_TYPE || "Short Dated";
const TIMEOUT_MS    = Math.max(1000, Number(__ENV.TIMEOUT_MS || 15000));
const MAX_RETRIES   = Math.max(0, Number(__ENV.MAX_RETRIES || 2));
const LOCAL_TIME    = __ENV.LOCAL_TIME || new Date().toISOString().slice(0, 19);

if (!API_TOKEN || !API_TOKEN.toLowerCase().startsWith("bearer ")) {
  throw new Error("API_TOKEN missing. Pass via env: -e API_TOKEN='Bearer <jwt>'");
}

export const options = {
  stages: [
    { duration: "1m", target: 10 },
    { duration: "3m", target: 10 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000", "avg<1000"],
    "wmd_status_2xx": ["rate>0.9"],
  },
};

// ==== metrics ====
const reqDuration = new Trend("wmd_req_duration_ms");
const reqSize     = new Trend("wmd_req_bytes");
const resSize     = new Trend("wmd_res_bytes");
const retryCount  = new Counter("wmd_req_retries");
const ok2xxRate   = new Rate("wmd_status_2xx");

// ==== CSV loaders ====
function loadCSV(path) {
  const text = open(path); // k6 bundles the file on run
  return papaparse.parse(text, { header: true }).data.filter(r => Object.values(r).some(v => v !== ""));
}

const storesRows = loadCSV(`../data/${CLIENT}/stores.csv`); // relative to scripts/ dir
const itemsRows  = loadCSV(`../data/${CLIENT}/items.csv`);

const STORES = storesRows.map(r => String(r.storeID).trim()).filter(Boolean);
const ITEMS  = itemsRows.map(r => ({ id: String(r.itemID).trim(), barcode: String(r.barcode).trim() }))
                        .filter(r => r.id && r.barcode);

// ==== dates ====
const baseDate = new Date(LOCAL_TIME);
const yyyy_mm_dd = (d) => d.toISOString().slice(0, 10);
const EXPIRY_0 = yyyy_mm_dd(baseDate);
const EXPIRY_1 = yyyy_mm_dd(new Date(baseDate.getTime() + 1 * 86400000));
const EXPIRY_2 = yyyy_mm_dd(new Date(baseDate.getTime() + 2 * 86400000));
const EXPIRY_3 = yyyy_mm_dd(new Date(baseDate.getTime() + 3 * 86400000));

const ITEM_TEMPLATES = [
  { expiryTime: EXPIRY_0, qtyMarkdown: 1 },
  { expiryTime: EXPIRY_1, qtyMarkdown: 5 },
  { expiryTime: EXPIRY_2, qtyMarkdown: 15 },
  { expiryTime: EXPIRY_3, qtyMarkdown: 5 },
];

// ==== helpers ====
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function uniqueItemsById(n) {
  const chosen = new Map();
  let guard = 0;
  while (chosen.size < n && guard++ < 2000) {
    const p = pick(ITEMS);
    chosen.set(p.id, p);
  }
  return Array.from(chosen.values());
}

function buildPayload(storeId, itemsNeeded) {
  const itemsChosen = uniqueItemsById(itemsNeeded).map((p) => {
    const tpl = pick(ITEM_TEMPLATES);
    return {
      barcode: p.barcode,
      itemID: p.id,
      itemGroupID: "",
      itemGroupType: null,
      originalPrice: null,
      currentPrice: null,
      markdownType: MARKDOWN_TYPE,
      markdownIteration: null,
      expiryTime: tpl.expiryTime,
      qtyMarkdown: tpl.qtyMarkdown,
      qtyOnHand: null,
      qtySoldToday: null,
    };
  });
  return { storeID: storeId, storeBanner: "", localTime: LOCAL_TIME, items: itemsChosen };
}

function guid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function postWithRetry(url, body, headers, maxRetries, timeoutMs) {
  const baseParams = { headers, timeout: `${timeoutMs}ms`, responseType: "text" };
  const started = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const h = { ...baseParams.headers, "x-correlation-id": guid() };
    try {
      const res = http.post(url, body, { ...baseParams, headers: h });
      reqDuration.add(Date.now() - started);
      reqSize.add(body.length);
      resSize.add(Number(res.headers["Content-Length"] || 0));

      // retry on 408/429/5xx
      if (res.status === 408 || res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        if (attempt < maxRetries) {
          retryCount.add(1);
          sleep(Math.min(1 + attempt * 0.5, 3));
          continue;
        }
      }
      return res;
    } catch (e) {
      if (attempt < maxRetries) {
        retryCount.add(1);
        sleep(Math.min(1 + attempt * 0.5, 3));
        continue;
      }
      throw e;
    }
  }
  return null;
}

// ==== VU flow ====
export default function () {
  if (STORES.length === 0 || ITEMS.length === 0) {
    throw new Error(`Missing data: STORES=${STORES.length}, ITEMS=${ITEMS.length} (client=${CLIENT})`);
  }

  const storeId = pick(STORES);
  const payload = buildPayload(storeId, ITEM_COUNT);
  const body = JSON.stringify(payload);

  const headers = {
    "Content-Type": "application/json",
    "Accept-Encoding": "*.*",
    Authorization: API_TOKEN,
  };

  let res;
  try {
    res = postWithRetry(API_URL, body, headers, MAX_RETRIES, TIMEOUT_MS);
  } catch (e) {
    console.error(`❌ Request error: ${e}`);
    ok2xxRate.add(false);
    return;
  }

  const ok = check(res, { "status is 200": (r) => r.status === 200 });
  ok2xxRate.add(ok);

  if (!ok && __ITER % 25 === 0) {
    console.warn(`[${exec.vu.idInInstance}] status=${res.status} bodySample=${(res.body || "").substring(0, 400)}...`);
  }

  sleep(1);
}

// ==== rich summary artifacts ====
export function handleSummary(data) {
  return {
    "results/summary.html": htmlReport(data),
    "results/summary.json": JSON.stringify(data, null, 2),
    "results/junit.xml": jUnit(data),
  };
}
