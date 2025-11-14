// config/homebargain.config.js

// Simple ddmmyyyy helper for requestID
function todayAsCompact() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

function buildRequestId() {
  const suffix = (__ENV.REQUEST_SUFFIX || "").toString().trim();
  return `HomeBargainPerformanceTest-${todayAsCompact()}${suffix ? "-" + suffix : ""}`;
}

export default {
  // === Identity ===
  name: "HomeBargain",

  // 🔑 env var for the token:
  //   -e TOKEN_HOMEBARGAIN="Bearer eyJ..."
  tokenEnv: "TOKEN_HOMEBARGAIN",

  // Base URL (mainly used for logs / preflight)
  apiUrl: "https://uks-hb-webapi-dev.azurewebsites.net/api/v-20180601/markdown",


  // === Data source ===
  csvPath: "../dataFiles/Homebargaindata.csv",

  // Only keep valid rows (adjust column names if needed)
  csvFilter: (row) =>
    row &&
    row.STOREID &&
    (row.BarCode || row.BARCODE) &&
    row.ORIGINAL_PRICE &&
    row.CURRENT_PRICE &&
    row.QTY_MARKDOWN,

  // Optional APIM / tenant headers
  extraHeaders: {
    // "Ocp-Apim-Subscription-Key": __ENV.HB_APIM_KEY || "",
    // "x-tenant-id": "HOMEBARGAIN",
  },

  // ---------- Operations used by markdown.client.test.js ----------
  operations: [
    {
      key: "markdown",
      method: "POST",
      url: "https://uks-hb-webapi-dev.azurewebsites.net/api/v-20180601/markdown",

      contentType: "application/json",

      buildPayload: (row) => {
        const MARKDOWN_TYPES = ["Short Dated", "Damaged"];
        const markdownType = MARKDOWN_TYPES[Math.floor(Math.random() * MARKDOWN_TYPES.length)];

        const now = new Date();
        const localTime = new Date(now).toISOString();
        const expiryDate = new Date(now).toISOString().split("T")[0];

        return {
          storeID: row.STOREID,
          storeBanner: null,
          requestID: buildRequestId(),
          localTime,
          items: [
            {
              barcode: row.BARCODE,
              itemID: null,
              itemGroupID: null,
              itemGroupType: null,
              originalPrice: parseFloat(row.ORIGINAL_PRICE),
              currentPrice: parseFloat(row.CURRENT_PRICE),
              markdownType,
              markdownIteration: 1,
              expiryDate,
              qtyMarkdown: parseInt(row.QTY_MARKDOWN, 10),
              qtyOnHand: parseInt(row.QTY_ON_HAND || row.QTY_MARKDOWN, 10),
              qtySoldToday: null,
            },
          ],
        };
      },

      extraHeaders: {
        // per-op overrides if needed, otherwise keep empty
      },
    },
  ],

  // === Cloud defaults ===
  cloud: {
    projectID: 3686723,
    name: "HomeBargainWaste&Markdown",
    distribution: {
      london: { loadZone: "amazon:gb:london", percent: 100 },
    },
  },

  // === Scenario defaults ===
  scenario: {
    executor: "ramping-vus",
    startVUs: Number(__ENV.RAMP_START_VUS || 5),
    stages: [
      { target: Number(__ENV.RAMP_TARGET_VUS || 50), duration: __ENV.RAMP_DURATION || "2m" },
      { target: Number(__ENV.STEADY_VUS || 50), duration: __ENV.STEADY_DURATION || "3m" },
    ],
    gracefulRampDown: "30s",
  },

  // Think time (ms)
  think: {
    minMs: Number(__ENV.SLEEP_MIN_MS || 500),
    maxMs: Number(__ENV.SLEEP_MAX_MS || 1500),
  },
};
