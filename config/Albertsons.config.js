// clients/Albertsons.config.js

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
  return `AlbertsonsPerformanceTest-${todayAsCompact()}${suffix ? "-" + suffix : ""}`;
}

export default {
  // === Identity ===
  name: "Albertsons",
  tokenEnv: "TOKEN_ALBERTSONS", // <— set this env var with your Bearer token

  // === Endpoint ===
  apiUrl: "https://eu2-alwmd-webapi-dev.azurewebsites.net/api/v-20180601/markdown",

  // === Data source ===
  csvPath: "../dataFiles/AlbertsonsData.csv",

  // Only keep rows that have the fields your payload needs
  csvFilter: (row) =>
   row &&
    row.STOREID &&
    row.BARCODE &&
    row.ITEMID &&
    row.ORIGINAL_PRICE &&
    row.CURRENT_PRICE &&
    row.QTY_MARKDOWN,
	
	// One operation so k6 Cloud can group metrics by name
  operations: [
    {
      key: "markdown",
      method: "POST",
      url: "https://eu2-alwmd-webapi-dev.azurewebsites.net/api/v-20180601/markdown",
      contentType: "application/json",
      buildPayload: (row) => {
        const now = new Date();
        const localTime = now.toISOString();
        const expiryDate = now.toISOString().split("T")[0];
        const requestId = `IceLandPerformanceTest-${expiryDate}`;
        const TYPES = ["Short Dated", "Damaged"];
        const markdownType = TYPES[Math.floor(Math.random() * TYPES.length)];
        return {
          storeID: row.STOREID,
          storeBanner: null,
          requestID: requestId,
          localTime,
          items: [
            {
              barcode: row.BARCODE,
              itemID: row.ITEMID,
              itemGroupID: null,
              itemGroupType: null,
              originalPrice: parseFloat(row.ORIGINAL_PRICE),
              currentPrice: parseFloat(row.CURRENT_PRICE),
              markdownType,
              markdownIteration: 1,
              expiryTime: expiryDate, // yyyy-mm-dd
              qtyMarkdown: parseInt(row.QTY_MARKDOWN, 10),
              qtyOnHand: parseInt(row.QTY_ON_HAND || row.QTY_MARKDOWN, 10),
              qtySoldToday: null,
            },
          ],
        };
      },
      extraHeaders: {},
    },
  ],

  // === Cloud run defaults (you can override from CLI env) ===
  cloud: {
    projectID: 3686723,
    name: "AlbertsonsWaste&Markdown",
    distribution: {
      london: { loadZone: "amazon:us:ashburn", percent: 100 },
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
 };