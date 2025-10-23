// lib/csv.js
import { SharedArray } from "k6/data";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import exec from "k6/execution";

// Resolve CSV paths relative to THIS file (future-proof)
function resolvePath(relPath) {
  // always use forward slashes in repo paths
  return import.meta.resolve(relPath);
}

export function loadCsv(relPath, filterFn) {
  const key = `csv:${relPath}`;
  return new SharedArray(key, () => {
    const resolved = resolvePath(relPath);
    const text = open(resolved); // k6 bundles files referenced by open()
    const rows = papaparse.parse(text, { header: true }).data;
    return filterFn ? rows.filter(filterFn) : rows;
  });
}

export function rowForVu(rows) {
  const idx = (exec.vu.idInTest - 1) % rows.length;
  return rows[idx];
}
