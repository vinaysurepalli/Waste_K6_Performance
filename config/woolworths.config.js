// clients/woolworths.config.js

// Small helper for ddmmyyyy
function todayAsCompact() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

// Optional suffix for request id (set -e REQUEST_SUFFIX=3 or in .env)
function buildRequestId() {
  const suffix = (__ENV.REQUEST_SUFFIX || "").toString().trim();
  return `WoolworthsPerformanceTest-${todayAsCompact()}${suffix ? "-" + suffix : ""}`;
}

export default {
  // === Identity ===
  name: "Woolworths",
  tokenEnv: "TOKEN_AU", // <— set this env var with your Bearer token

  // === Endpoint ===
  apiUrl: "https://aea-wmdau-webapi-crt-web.azurewebsites.net/api/v-20180601/markdown",

  // === Data source ===
  csvPath: "../dataFiles/WoolworthsData.csv",

  // Only keep rows that have the fields your payload needs
  csvFilter: (row) =>
    row.STOREID &&
    row.ORIGINAL_PRICE &&
    row.CURRENT_PRICE &&
    row.QTY_MARKDOWN &&
    row.storeBanner &&
    row.Item_ID &&
    row.itemGroupID &&
    row.QTY_ON_HAND,

  // === Optional per-client headers (leave empty if not needed) ===
  extraHeaders: {
    // e.g. "Ocp-Apim-Subscription-Key": __ENV.WOOL_APIM_KEY || "",
    // e.g. "x-tenant-id": "WOOLWORTHS",
  },

  // === Cloud run defaults (you can override from CLI env) ===
  cloud: {
    projectID: 3686723,
    name: "WoolworthsWaste&Markdown",
    distribution: {
      distributionLabel1: { loadZone: "amazon:au:sydney", percent: 100 },
    },
  },

  // === Scenario defaults (ramping-vus) ===
  scenario: {
    executor: "ramping-vus",
    startVUs: Number(__ENV.RAMP_START_VUS || 10),
    stages: [
      { target: Number(__ENV.RAMP_TARGET_VUS || 100), duration: String(__ENV.RAMP_DURATION || "5m") },
      { target: Number(__ENV.STEADY_VUS || 50),        duration: String(__ENV.STEADY_DURATION || "2m") },
    ],
    gracefulRampDown: "30s",
  },

  // === Payload builder (matches your original script) ===
  buildPayload: (row) => {
    const MARKDOWN_TYPES = ["Short Dated", "Short Dated"];
    const markdownType = MARKDOWN_TYPES[Math.floor(Math.random() * MARKDOWN_TYPES.length)];

    const now = new Date();
    const localTime = new Date(now.getTime() + 10 * 60 * 60 * 1000).toISOString();   // +10h
    const expiryTime = new Date(now.getTime() + 16 * 60 * 60 * 1000).toISOString();  // +16h

    return {
      storeID: row.STOREID,
      storeBanner: row.storeBanner,
      requestID: buildRequestId(),
      localTime,
      items: [
        {
          barcode: null,
          itemID: row.Item_ID,
          itemGroupID: row.itemGroupID,
          itemGroupType: null,
          originalPrice: parseFloat(row.ORIGINAL_PRICE),
          currentPrice: parseFloat(row.CURRENT_PRICE),
          markdownType,
          markdownIteration: 1,
          expiryTime,
          qtyMarkdown: parseInt(row.QTY_MARKDOWN, 10),
          qtyOnHand: parseInt(row.QTY_ON_HAND || row.QTY_MARKDOWN, 10),
          qtySoldToday: null,
        },
      ],
    };
  },
};
