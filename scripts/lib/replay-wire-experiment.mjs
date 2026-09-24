// Experimental only: NOT imported by tracker, ingest or shared production packages.
const MAX_BYTES = 7_000_000;
const MAX_REFERENCES = 20_000;
const MAX_DICTIONARY = 256;
const keys = ["url", "currentUrl", "method", "initiatorType", "correlationId"];
const defaults = { requestHeaders: {}, responseHeaders: {}, schemaVersion: 1, captureMode: "metadata" };
const clone = value => JSON.parse(JSON.stringify(value));
const fail = () => { throw new Error("Invalid experimental replay envelope"); };
const checkSize = value => { if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES) fail(); };

function requests(batch) {
  const result = [];
  for (const [eventIndex, event] of (batch?.events ?? []).entries()) {
    if (event?.type !== 6 || event.data?.plugin !== "rrweb/network@1" || event.data?.payload?.version !== 1) continue;
    const list = event.data.payload.requests;
    if (!Array.isArray(list)) continue;
    for (const [requestIndex, request] of list.entries()) {
      if (!request || typeof request !== "object" || Array.isArray(request)) continue;
      result.push([eventIndex, requestIndex, request]);
      if (result.length > MAX_REFERENCES) fail();
    }
  }
  return result;
}

export function encodeExperiment(input, codec) {
  checkSize(input);
  const batch = clone(input);
  const references = [], dictionary = [];
  const list = requests(batch);
  if (codec === "defaults") {
    for (const [ei, ri, request] of list) {
      for (const [ki, [key, value]] of Object.entries(defaults).entries()) {
        if (Object.hasOwn(request, key) && JSON.stringify(request[key]) === JSON.stringify(value)) {
          delete request[key]; references.push([ei, ri, ki]);
        }
      }
    }
  } else if (codec === "dictionary") {
    const counts = new Map();
    for (const [, , request] of list) for (const key of keys) {
      const value = request[key];
      if (typeof value === "string" && value.length >= 4) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    dictionary.push(...[...counts].filter(([, count]) => count > 1).slice(0, MAX_DICTIONARY).map(([text]) => text));
    const indices = new Map(dictionary.map((text, i) => [text, i]));
    for (const [ei, ri, request] of list) for (const [ki, key] of keys.entries()) {
      const index = indices.get(request[key]);
      if (index === undefined) continue;
      delete request[key]; references.push([ei, ri, ki, index]);
    }
  } else fail();
  if (references.length > MAX_REFERENCES) fail();
  const wire = { wireVersion: 2, codec, batch, references, ...(codec === "dictionary" ? { dictionary } : {}) };
  checkSize(wire);
  return wire;
}

export function decodeExperiment(wire) {
  checkSize(wire);
  if (!wire || wire.wireVersion !== 2 || !["defaults", "dictionary"].includes(wire.codec) ||
      !Array.isArray(wire.references) || wire.references.length > MAX_REFERENCES) fail();
  const batch = clone(wire.batch);
  const targets = new Map(requests(batch).map(([ei, ri, request]) => [`${ei}:${ri}`, request]));
  const dictionary = wire.dictionary;
  if (wire.codec === "dictionary" && (!Array.isArray(dictionary) || dictionary.length > MAX_DICTIONARY ||
      dictionary.some(value => typeof value !== "string"))) fail();
  const seen = new Set();
  for (const ref of wire.references) {
    const length = wire.codec === "defaults" ? 3 : 4;
    if (!Array.isArray(ref) || ref.length !== length || ref.some(index => !Number.isSafeInteger(index) || index < 0)) fail();
    const [ei, ri, ki, di] = ref;
    const request = targets.get(`${ei}:${ri}`);
    const key = (wire.codec === "defaults" ? Object.keys(defaults) : keys)[ki];
    const address = `${ei}:${ri}:${ki}`;
    if (!request || !key || Object.hasOwn(request, key) || seen.has(address)) fail();
    seen.add(address);
    if (wire.codec === "dictionary" && di >= dictionary.length) fail();
    request[key] = wire.codec === "defaults" ? clone(defaults[key]) : dictionary[di];
  }
  checkSize(batch); // Compact bytes never replace the canonical budget.
  return batch;
}
