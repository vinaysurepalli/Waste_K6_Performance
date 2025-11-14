// config/kroger.config.js

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
  return `KrogerPerformanceTest-${todayAsCompact()}${suffix ? "-" + suffix : ""}`;
}

export default {
  // === Identity ===
  name: "Kroger",

  // 🔑 env var for the token:
   tokenEnv: "TOKEN_KROGER",

 
  apiUrl: "https://krwmd1-wmd-dev.ri-team.com/api/v-20180601/markdown",

  
  // === Data source ===
  csvPath: "../dataFiles/KrogerData(HighVolume).csv",

  // Only keep valid rows (adjust column names if needed)
  csvFilter: (row) =>
    row.STOREID &&
    row.ITEMID &&
    row.ITEMGROUPID &&
    row.QTY_MARKDOWN &&
    row.CURRENT_PRICE &&
    row.ORIGINAL_PRICE ,

  // Optional APIM / tenant headers
  extraHeaders: {
    // "Ocp-Apim-Subscription-Key": __ENV.HB_APIM_KEY || "",
    // "x-tenant-id": "KROGER",
  },

  // ---------- Operations used by markdown.client.test.js ----------
  operations: [
    {
      key: "markdown",
      method: "POST",
      // If you have a specific DEV/CRT/PRD URL, put it here:
      url: "https://krwmd1-wmd-dev.ri-team.com/api/v-20180601/markdown",
            contentType: "application/json",
  buildPayload: (row) => {
    const now = new Date();
    const localTime  = new Date().toISOString();
    const expiryDate = new Date(now.setHours(now.getHours())).toISOString().split("T")[0];

    return {
      storeID: row.STOREID,
      storeBanner: "",
      requestID: `k6-${expiryDate}`,
      localTime,
      items: [
        {
          barcode: null,
          itemID: row.ITEMID,
          itemGroupID: row.ITEMGROUPID, // keep casing that backend expects
          itemGroupType: null,
          originalPrice: parseFloat(row.ORIGINAL_PRICE),
          currentPrice: parseFloat(row.CURRENT_PRICE),
          markdownType: "Short Dated",
          markdownIteration: 1,
          expiryTime: expiryDate,
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
    name: "krogerPerformaceTest",
    distribution: {
      east: { loadZone: "amazon:us:ashburn", percent: 50 },
      west: { loadZone: "amazon:us:palo alto", percent: 50 },
    },
  },
  scenario: {
    executor: "ramping-vus",
    startVUs: Number(__ENV.RAMP_START_VUS || 20),
    stages: [
      { target: Number(__ENV.RAMP_TARGET_VUS || 200), duration: String(__ENV.RAMP_DURATION || "2m") },
      { target: Number(__ENV.RAMP_TARGET_VUS || 200), duration: String(__ENV.STEADY_DURATION || "2m") },
    ],
    gracefulRampDown: "30s",
  },

  // Think time (ms)
  think: {
    minMs: Number(__ENV.SLEEP_MIN_MS || 500),
    maxMs: Number(__ENV.SLEEP_MAX_MS || 1500),
  },
};
