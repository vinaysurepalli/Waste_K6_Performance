// lib/backoff.js
export function withRetry(fn, { tries = 4, baseMs = 250, jitter = true } = {}) {
  return (...args) => {
    let attempt = 0;
    while (attempt < tries) {
      const res = fn(...args);
      if (res) return res;
      attempt++;
      const backoff = baseMs * Math.pow(2, attempt - 1);
      const wait = jitter ? backoff * (0.5 + Math.random()) : backoff;
      // busy-wait in ms (k6 has sleep in seconds only inside default(); this util used inside default())
      const end = Date.now() + wait;
      while (Date.now() < end) { /* noop */ }
    }
    return null;
  };
}
