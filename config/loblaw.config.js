// clients/Loblaw.config.js

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
  return `LoblawPerformanceTest-${todayAsCompact()}${suffix ? "-" + suffix : ""}`;
}

export default {
  // === Identity ===
  name: "Loblaw",

  // 🔑 env var for the token:
   tokenEnv: "TOKEN_LOBLAW",

 
  apiUrl: "https://lobwmd-wmd-dev.ri-team.com/api/v-20180601/markdown",

  
  // === Data source ===
  csvPath: "../dataFiles/LoblawData.csv",

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
    // e.g. "Ocp-Apim-Subscription-Key": __ENV.WOOL_APIM_KEY || "",
    // e.g. "x-tenant-id": "",
  },

  // ---------- Operations used by markdown.client.test.js ----------
  operations: [
    {
      key: "markdown",
      method: "POST",
      // If you have a specific DEV/CRT/PRD URL, put it here:
      url: "https://lobwmd-wmd-dev.ri-team.com/api/v-20180601/markdown",
            contentType: "application/json",
 // === Payload builder (matches your original script) ===
  buildPayload: (row) => {
    const MARKDOWN_TYPES = ["Expiry", "Markdown only"];
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
          itemID: row.ITEM_ID || null,
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

  // === Cloud run defaults (you can override from CLI env) ===
  cloud: {
    projectID: 3686723,
    name: "LoblawWaste&Markdown",
   distribution: {
      distributionLabel1: { loadZone: 'amazon:us:ashburn', percent: 50 },
      distributionLabel2: { loadZone: 'amazon:us:palo alto', percent: 50 },
       },
  },

  // === Scenario defaults (ramping-vus) ===
  scenario: {
    executor: "ramping-vus",
    startVUs: Number(__ENV.RAMP_START_VUS || 10),
       stages: [
      { target: Number(__ENV.RAMP_TARGET_VUS || 200), duration: String(__ENV.RAMP_DURATION || "2m") },
      { target: Number(__ENV.STEADY_VUS || 300),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 400),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 500),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 600),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 700),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 800),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 900),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1000),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1100),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1200),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1300),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1400),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1500),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1600),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1700),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1800),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1900),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 2000),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1800),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1600),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1400),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1200),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 1000),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 800),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 600),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 400),        duration: String(__ENV.STEADY_DURATION || "2m") },
    //   { target: Number(__ENV.STEADY_VUS || 200),        duration: String(__ENV.STEADY_DURATION || "2m") },
    ],
    gracefulRampDown: "30s",
  },
};
