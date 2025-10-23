// lib/http.js
import http from "k6/http";

export function req(method, url, body, headers = {}) {
  const opts = { headers };
  let payload = body;

  // auto JSON stringify for objects
  if (body && typeof body === "object") {
    payload = JSON.stringify(body);
    if (!headers["Content-Type"] && !headers["content-type"]) {
      opts.headers = { ...headers, "Content-Type": "application/json" };
    }
  }

  try {
    switch (String(method).toUpperCase()) {
      case "GET":
        return http.get(url, opts);
      case "POST":
        return http.post(url, payload, opts);
      case "PUT":
        return http.put(url, payload, opts);
      case "PATCH":
        return http.patch(url, payload, opts);
      case "DELETE":
        return http.del(url, null, opts);
      default:
        return http.request(method, url, payload, opts);
    }
  } catch (e) {
    // network error
    return null;
  }
}
