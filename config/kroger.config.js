export default {
  name: "Kroger",
  tokenEnv: "KROGER_TOKEN", // or "TOKEN" if you want to reuse one env var for all
  apiUrl: "https://krwmd1-wmd-dev.ri-team.com/api/v-20180601/markdown",

  // Use the SAME CSV you used when it worked
  csvPath: "../dataFiles/LoadTestingSamples(HighVolume).csv",
  csvFilter: (row) =>
    row.STOREID &&
    row.ITEMID &&
    row.ITEMGROUPID &&
    row.QTY_MARKDOWN &&
    row.CURRENT_PRICE &&
    row.ORIGINAL_PRICE ,

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

  // Only include headers when you actually provide values
  extraHeaders: () => {
    const h = {};
    if (__ENV.KROGER_SUBSCRIPTION_KEY) h["Ocp-Apim-Subscription-Key"] = __ENV.KROGER_SUBSCRIPTION_KEY;
    if (__ENV.KROGER_TENANT_ID)        h["x-tenant-id"]               = __ENV.KROGER_TENANT_ID; // e.g. "KROGER"
    return h;
  },

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
};
