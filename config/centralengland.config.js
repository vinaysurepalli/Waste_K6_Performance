// config/centralengland.config.js

// ddmmyyyy for request id
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
  return `CentralEnglandPerformanceTest-${todayAsCompact()}${suffix ? "-" + suffix : ""}`;
}

const REQUEST_ID_PREFIX = "CentralEnglandPerformanceTest-";

export default {
  // === Identity ===
  name: "CentralEngland",
  // Use THIS env var at runtime: -e TOKEN_CENTRALENGLAND="Bearer eyJ..."
  tokenEnv: "TOKEN_CENTRALENGLAND",

  // === Default single-endpoint fields (kept for backward compat; not used in ops loop) ===
  apiUrl: "https://ce-wmd-crt.ri-team.com/api/v-20180601/markdown",

  // === Data source ===
  // Adjust if your repo path differs.
  csvPath: "../dataFiles/CentralEnglandData.csv",

  // Only keep rows that have the fields your payload needs
  csvFilter: (row) =>
    row &&
    row.STOREID &&
    row.BARCODE &&
    row.ORIGINAL_PRICE &&
    row.CURRENT_PRICE &&
    row.QTY_MARKDOWN,

  // === Optional per-client headers (leave empty if not needed) ===
  extraHeaders: {
    // e.g. "Ocp-Apim-Subscription-Key": __ENV.CE_APIM_KEY || "",
    // e.g. "x-tenant-id": "CENTRALENGLAND",
  },

  // === Cloud run defaults (override via env if you like) ===
  cloud: {
    projectID: 3686723,
    name: "CentralEnglandWaste&Markdown",
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

  // ---------- Two-endpoint flow ----------
  operations: [
    {
      key: "markdown",
      method: "POST",
      url: "https://ce-wmd-crt.ri-team.com/api/v-20180601/markdown",
      contentType: "application/json",
      buildPayload: (row) => {
        const now = new Date();
        const requestID = buildRequestId() || `${REQUEST_ID_PREFIX}${todayAsCompact()}`;
        const expiry =
          (row.EXPIRY_DATE ||
            new Date(now.setHours(now.getHours() + 16)).toISOString().slice(0, 10));

        const barcode = row.BarCode || row.BARCODE;
        return {
          storeID: row.STOREID,
          storeBanner: row.storeBanner || "",
          requestID,
          localTime: new Date().toISOString(),
          items: [
            {
              barcode,
              itemID: row.ITEMID || null,             // set if present
              itemGroupID: row.itemGroupID || null,
              itemGroupType: row.itemGroupType || null,
              originalPrice: Number(row.ORIGINAL_PRICE),
              currentPrice: Number(row.CURRENT_PRICE),
              markdownType: row.MARKDOWN_TYPE || "Short Dated",
              markdownIteration: Number(row.MARKDOWN_ITERATION || 1),
              expiryTime: expiry, // yyyy-mm-dd
              qtyMarkdown: Number(row.QTY_MARKDOWN),
              qtyOnHand: Number(row.QTY_ON_HAND || row.QTY_MARKDOWN),
              qtySoldToday: row.QTY_SOLD_TODAY ? Number(row.QTY_SOLD_TODAY) : null,
            },
          ],
        };
      },
      extraHeaders: {}, // e.g., "x-tenant-id": "CENTRALENGLAND"
    },
    {
      key: "prompted",
      method: "POST",
      url: "https://ce-wmd-crt.ri-team.com/api/v-20180601/datechecker/save",
      // If API insists on patch+json:
      // set -e CE_PROMPTED_CT=application/json-patch+json
      contentType: __ENV.CE_PROMPTED_CT || "application/json",
      buildPayload: (row) => {
        const expiry = row.EXPIRY_DATE || new Date().toISOString().slice(0, 10);
        const barcode = row.BarCode || row.BARCODE;
        return {
          itemID: Number(row.ITEMID || 0),                // adjust if mandatory
          storeID: row.STOREID,                            // API supports single store per call here
          expiryDate: expiry,                              // YYYY-MM-DD
          quantity: Number(row.QUANTITY || row.QTY_MARKDOWN || 1),
          barcode,
        };
      },
      extraHeaders: {}, // e.g., "x-tenant-id": "CENTRALENGLAND"
    },
  ],

  // Think-time defaults (ms)
  think: {
    minMs: Number(__ENV.SLEEP_MIN_MS || 500),
    maxMs: Number(__ENV.SLEEP_MAX_MS || 1500),
  },
};
