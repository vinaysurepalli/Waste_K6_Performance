// clients/iceland.config.js
// iceland: barcode-only payload
//https://uks-icewmd-webapi-prd.azurewebsites.net/api/v-20180601/markdown  <-- Production API

export default {
  name: "Iceland",
  tokenEnv: "TOKEN_ICELAND", // <— set this env var with your Bearer token
  apiUrl: "https://uks-icewmd-webapi-dev.azurewebsites.net/api/v-20180601/markdown",
  csvPath: "../dataFiles/IcelandTestDataset.csv",
  csvFilter: (row) =>
    row &&
    row.STOREID &&
    row.BARCODE &&
    row.ORIGINAL_PRICE &&
    row.CURRENT_PRICE &&
    row.QTY_MARKDOWN,

  buildPayload: (row) => {
    const now = new Date();
    const localTime = new Date(now).toISOString();
    const expiryDate = new Date(now).toISOString().split("T")[0];
    const requestId = `IceLandPerformanceTest-${expiryDate}`;
    const MARKDOWN_TYPES = ["Short Dated", "Damaged", "Quality", "Split Pack"];
    const markdownType = MARKDOWN_TYPES[Math.floor(Math.random() * MARKDOWN_TYPES.length)];

    return {
      storeID: row.STOREID,
      storeBanner: null,
      requestID: requestId,
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
          expiryTime: expiryDate, // yyyy-mm-dd
          qtyMarkdown: parseInt(row.QTY_MARKDOWN),
          qtyOnHand: parseInt(row.QTY_ON_HAND || row.QTY_MARKDOWN),
          qtySoldToday: null,
        },
      ],
    };
  },

  cloud: {
    projectID: 3686723,
    name: "IceLandPerformanceTest",
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
