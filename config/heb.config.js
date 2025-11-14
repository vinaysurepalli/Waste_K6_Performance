// config/heb.config.js

// ddmmyyyy for request id
function todayAsCompact() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

function buildRequestId() {
  const suffix = (__ENV.REQUEST_SUFFIX || "").toString().trim();
  return `HEBPerformanceTest-${todayAsCompact()}${suffix ? "-" + suffix : ""}`;
}

export default {
  // === Identity ===
  name: "HEB",

  // 🔑 This is the env var you must set:
  //   -e TOKEN_HEB="Bearer eyJ..."
  tokenEnv: "TOKEN_HEB",

  // === Default API URL (used mainly for logs / preflight) ===
  apiUrl: "https://eu2-hebwmd-webapi-dev.azurewebsites.net/api/v-20180601/markdown",

  // === Data source ===
  csvPath: "../dataFiles/HebTestdata1.csv",

  // Make sure these field names match your CSV (BarCode vs BARCODE, etc.)
  csvFilter: (row) =>
    row &&
    row.STOREID &&
    (row.BarCode || row.BARCODE) &&
    row.ORIGINAL_PRICE &&
    row.CURRENT_PRICE &&
    row.QTY_MARKDOWN,

  // Optional extra headers (APIM / tenant etc)
  extraHeaders: {
    // If HEB uses APIM and x-tenant-id, uncomment and set:
    // "Ocp-Apim-Subscription-Key": __ENV.HEB_APIM_KEY || "",
    // "x-tenant-id": "HEB",
  },

  // ---------- Operations (used by markdown.client.test.js) ----------
  operations: [
    {
      key: "markdown",
      method: "POST",
      // If you switch to CRT/PRD, change this URL *and* use a matching token
      url: "https://eu2-hebwmd-webapi-dev.azurewebsites.net/api/v-20180601/markdown",
      contentType: "application/json",
      buildPayload: (row) => {
        const now = new Date();
        const requestID = buildRequestId();

        // HEB usually expects full ISO date-time for expiryTime
        const expiryTime = new Date(now.setHours(now.getHours() + 8)).toISOString();
        const localTime = new Date().toISOString();

        const barcode = row.BarCode || row.BARCODE;

        return {
          storeID: row.STOREID,
          storeBanner: row.storeBanner || null,
          requestID,
          localTime,
          items: [
            {
              barcode,
              itemID: row.ITEMID || null,
              itemGroupID: row.itemGroupID || null,
              itemGroupType: row.itemGroupType || null,
              originalPrice: Number(row.ORIGINAL_PRICE),
              currentPrice: Number(row.CURRENT_PRICE),
              markdownType: row.MARKDOWN_TYPE || "Short Dated",
              markdownIteration: Number(row.MARKDOWN_ITERATION || 1),
              expiryTime, // full ISO timestamp
              qtyMarkdown: Number(row.QTY_MARKDOWN),
              qtyOnHand: Number(row.QTY_ON_HAND || row.QTY_MARKDOWN),
              qtySoldToday: row.QTY_SOLD_TODAY ? Number(row.QTY_SOLD_TODAY) : null,
            },
          ],
        };
      },
      extraHeaders: {}, // per-op overrides if needed
    },
  ],

  // === Cloud defaults ===
  cloud: {
    projectID: 3686723,
    name: "HEBWaste&Markdown",
    distribution: {
      london: { loadZone: "amazon:gb:london", percent: 100 },
    },
  },

  // === Scenario defaults (ramping-vus) ===
  scenario: {
    executor: "ramping-vus",
    startVUs: Number(__ENV.RAMP_START_VUS || 5),
    stages: [
      { target: Number(__ENV.RAMP_TARGET_VUS || 50), duration: __ENV.RAMP_DURATION || "2m" },
      { target: Number(__ENV.STEADY_VUS || 50),      duration: __ENV.STEADY_DURATION || "3m" },
    ],
    gracefulRampDown: "30s",
  },

  // Think-time defaults (ms)
  think: {
    minMs: Number(__ENV.SLEEP_MIN_MS || 500),
    maxMs: Number(__ENV.SLEEP_MAX_MS || 1500),
  },
};
