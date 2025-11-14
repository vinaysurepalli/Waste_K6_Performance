// config/iceland.config.js

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
  return `IceLandPerformanceTest-${todayAsCompact()}${suffix ? "-" + suffix : "02"}`;
}

export default {
  name: "Iceland",
  tokenEnv: "TOKEN_ICELAND",
  //https://uks-icewmd-webapi-prd.azurewebsites.net/api/v-20180601/markdown  --Prod
  // DEV endpoint (make sure your token is for this resource)
  apiUrl: "https://uks-icewmd-webapi-prd.azurewebsites.net/api/v-20180601/markdown",

  csvPath: "../dataFiles/IcelandTestDataset.csv",
  csvFilter: (row) =>
    row &&
    row.STOREID &&
    row.BARCODE &&         // make sure the CSV header is BARCODE (not BarCode)
    row.ORIGINAL_PRICE &&
    row.CURRENT_PRICE &&
    row.QTY_MARKDOWN,

  // One operation so k6 Cloud can group metrics by name
  operations: [
    {
      key: "markdown",
      method: "POST",
      url: "https://uks-icewmd-webapi-prd.azurewebsites.net/api/v-20180601/markdown",
      contentType: "application/json",
      buildPayload: (row) => {
        const now = new Date();
        const localTime = now.toISOString();
        const expiryDate = now.toISOString().split("T")[0];
        const requestId = `IceLandPerformanceTest-${expiryDate}`;
        const TYPES = ["Short Dated", "Damaged", "Quality"];
        const markdownType = TYPES[Math.floor(Math.random() * TYPES.length)];
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

  cloud: {
    projectID: 3686723,
    name: "IceLandPerformanceTest",
    distribution: {
      distributionLabel1: { loadZone: "amazon:gb:london", percent: 100 },
    },
  },

  scenario: {
    executor: "ramping-vus",
    startVUs: Number(__ENV.RAMP_START_VUS || 50),
    stages: [
      { target: Number(__ENV.STEADY_VUS || 100), duration: __ENV.STEADY_DURATION || "5m" },
      { target: Number(__ENV.STEADY_VUS || 200), duration: __ENV.STEADY_DURATION || "5m" },
      { target: Number(__ENV.STEADY_VUS || 300), duration: __ENV.STEADY_DURATION || "5m" },
      { target: Number(__ENV.STEADY_VUS || 350), duration: __ENV.STEADY_DURATION || "5m" },
      { target: Number(__ENV.STEADY_VUS || 200), duration: __ENV.STEADY_DURATION || "5m" },
      { target: Number(__ENV.STEADY_VUS || 100), duration: __ENV.STEADY_DURATION || "5m" },
      
    ],
    gracefulRampDown: "30s",
  },
};
