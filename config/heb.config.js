// clients/heb.config.js
// HEB: barcode + itemID payload

function buildRequestId() {
  const suffix = (__ENV.REQUEST_SUFFIX || "").toString().trim();
  return `HEBPerformanceTest-${todayAsCompact()}${suffix ? "-" + suffix : "1"}`;
}

export default {
  name: "HEB",
  tokenEnv: "TOKEN_HEB",
  apiUrl: "https://eu2-hebwmd-webapi-dev.azurewebsites.net/api/v-20180601/markdown",
  csvPath: "../dataFiles/HebTestdata1.csv",
  csvFilter: (row) =>
    row &&
    row.STOREID &&
    row.BARCODE &&
    row.ITEMID &&
    row.ORIGINAL_PRICE &&
    row.CURRENT_PRICE &&
    row.QTY_MARKDOWN,

  buildPayload: (row) => {
    const MARKDOWN_TYPES = ["Short Dated", "Variable weight item"];
    const markdownType = MARKDOWN_TYPES[Math.floor(Math.random() * MARKDOWN_TYPES.length)];
    const now = new Date();
    const localTime = new Date(now).toISOString();
    const expiryTime = new Date(now.setHours(now.getHours() + 8)).toISOString(); // your original choice
    const requestId = `HEBPerformanceTest-${new Date().toISOString().split("T")[0]}`;

    return {
      storeID: row.STOREID,
      storeBanner: null,
      requestID: buildRequestId(),
      localTime,
      items: [
        {
          barcode: row.BARCODE,
          itemID: row.ITEM_ID,
          itemGroupID: null,
          itemGroupType: null,
          originalPrice: parseFloat(row.ORIGINAL_PRICE),
          currentPrice: parseFloat(row.CURRENT_PRICE),
          markdownType,
          markdownIteration: 1,
          expiryTime,
          qtyMarkdown: parseInt(row.QTY_MARKDOWN),
          qtyOnHand: parseInt(row.QTY_ON_HAND || row.QTY_MARKDOWN),
          qtySoldToday: null,
        },
      ],
    };
  },

  cloud: {
    projectID: 3686723,
    name: "HEBPerformanceTest",
    distribution: {
      london: { loadZone: "amazon:gb:london", percent: 100 },
    },
  },

  scenario: {
    executor: "ramping-vus",
    startVUs: Number(__ENV.RAMP_START_VUS || 5),
    stages: [
      { target: Number(__ENV.RAMP_TARGET_VUS || 50), duration: __ENV.RAMP_DURATION || "2m" },
      { target: Number(__ENV.STEADY_VUS || 50), duration: __ENV.STEADY_DURATION || "2m" },
    ],
    gracefulRampDown: "30s",
  },
};
