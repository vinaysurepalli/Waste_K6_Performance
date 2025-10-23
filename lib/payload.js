import { pickRandom } from "./csv.js";

// A generic payload builder you can reuse; each client config can
// provide either a fully custom buildPayload, or a mapping to this.
export function buildMarkdownPayload(row, {
  // mapping from CSV -> payload
  storeIdKey = "STOREID",
  barcodeKey = "BarCode",
  itemIdKey = "ITEMID",
  itemGroupIdKey = "ITEMGROUPID",
  originalPriceKey = "ORIGINAL_PRICE",
  currentPriceKey = "CURRENT_PRICE",
  qtyMarkdownKey = "QTY_MARKDOWN",
  qtyOnHandKey = "QTY_ON_HAND",
  markdownTypes = ["Short Dated"],
  requestPrefix = "MarkdownTest",
  expiryHoursOffset = 0,
  useDateOnlyExpiry = true, // true => YYYY-MM-DD
} = {}) {
  const now = new Date();
  const requestDate = new Date(now).toISOString().split("T")[0];
  const requestID = `${requestPrefix}-${requestDate}`;
  const localTime = new Date().toISOString();

  const expiry = new Date(now);
  expiry.setHours(expiry.getHours() + Number(expiryHoursOffset || 0));
  const expiryTime = useDateOnlyExpiry ? expiry.toISOString().split("T")[0] : expiry.toISOString();

  return {
    storeID: row[storeIdKey],
    storeBanner: "",
    requestID,
    localTime,
    items: [{
      barcode: row[barcodeKey] || null,
      itemID: row[itemIdKey] || null,
      itemGroupID: row[itemGroupIdKey] || row[itemGroupIdKey?.toLowerCase?.()] || null,
      itemGroupType: null,
      originalPrice: Number(row[originalPriceKey]),
      currentPrice: Number(row[currentPriceKey]),
      markdownType: pickRandom(markdownTypes),
      markdownIteration: 1,
      expiryTime,
      qtyMarkdown: Number(row[qtyMarkdownKey]),
      qtyOnHand: Number(row[qtyOnHandKey] || row[qtyMarkdownKey] || 0),
      qtySoldToday: null,
    }],
  };
}
