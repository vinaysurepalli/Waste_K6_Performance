// lib/logger.js
export function logKV(msg, kv) {
  console.log(`${msg} ${JSON.stringify(kv)}`);
}
export function warn(msg) {
  console.warn(msg);
}
export function err(msg) {
  console.error(msg);
}
