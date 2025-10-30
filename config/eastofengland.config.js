// clients/eastofengland.config.js

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
  return `EastOfEnglandPerformanceTest-${todayAsCompact()}${suffix ? "-" + suffix : ""}`;
}

export default {
  // === Identity ===
  name: "EastOfEngland",
  tokenEnv: "TOKEN_EASTOFENGLAND", // <— set this env var with your Bearer token

  // === Endpoint ===
  apiUrl: "https://ee-wmd-dev.ri-team.com/api/v-20180601/markdown",

  // === Data source ===
  csvPath: "../dataFiles/EastofEnglandData.csv",

  // Only keep rows that have the fields your payload needs
  csvFilter: (row) =>
   row &&
    row.STOREID &&
    row.BarCode &&
    row.Item_ID &&
    row.ORIGINAL_PRICE &&
    row.CURRENT_PRICE &&
    row.QTY_MARKDOWN,
  // === Optional per-client headers (leave empty if not needed) ===
  extraHeaders: {
    // e.g. "Ocp-Apim-Subscription-Key": __ENV.WOOL_APIM_KEY || "",
    // e.g. "x-tenant-id": "WOOLWORTHS",
  },

  // === Cloud run defaults (you can override from CLI env) ===
  cloud: {
    projectID: 3686723,
    name: "EastOfEnglandWaste&Markdown",
    distribution: {
      london: { loadZone: "amazon:gb:london", percent: 100 },
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
    const MARKDOWN_TYPES = ["Short Dated", "Damaged"];
    const markdownType = MARKDOWN_TYPES[Math.floor(Math.random() * MARKDOWN_TYPES.length)];

    const now = new Date();
    const localTime = new Date(now).toISOString();
    const expiryDate = new Date(now).toISOString().split("T")[0];

    return {
      storeID: row.STOREID,
      storeBanner: row.storeBanner,
      requestID: buildRequestId(),
      localTime,
      items: [
        {
          barcode: row.BarCode,
          itemID: row.Item_ID,
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
};
