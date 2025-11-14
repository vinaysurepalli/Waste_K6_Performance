// lib/http.js
import http from "k6/http";

function scrubHeaderValue(v) {
  if (v == null) return v;
  return String(v)
    .replace(/^\uFEFF/, "")
    .replace(/[\x00-\x1F\x7F]/g, "") // remove control chars
    .trim();
}

export function req(method, url, body, opts = {}) {
  const headersIn = opts.headers || {};
  const headers = {};
  for (const k in headersIn) headers[k] = scrubHeaderValue(headersIn[k]);

  const httpOpts = { ...opts, headers };
  let payload = body;

  if (body && typeof body === "object" && !(body instanceof ArrayBuffer)) {
    payload = JSON.stringify(body);
    if (!headers["Content-Type"] && !headers["content-type"]) {
      httpOpts.headers["Content-Type"] = "application/json";
    }
  }

  try {
    switch (String(method).toUpperCase()) {
      case "GET":
        return http.get(url, httpOpts);
      case "POST":
        return http.post(url, payload, httpOpts);
      case "PUT":
        return http.put(url, payload, httpOpts);
      case "PATCH":
        return http.patch(url, payload, httpOpts);
      case "DELETE":
        return http.del(url, null, httpOpts);
      default:
        return http.request(method, url, payload, httpOpts);
    }
  } catch (_) {
    return null;
  }
}
