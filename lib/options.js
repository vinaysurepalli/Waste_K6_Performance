// lib/options.js
export const defaultOptions = {
  thresholds: {
    http_req_failed: ["rate<0.1"],
    http_req_duration: ["avg<250", "p(95)<200"],
  },
};
