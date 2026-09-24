import { createReplayCorpus } from "./replay-corpus.mjs";
import { encodeExperiment, decodeExperiment } from "./replay-wire-experiment.mjs";

const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export async function measureBrowser(attempts = 30) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 100) throw new Error("Invalid iterations");
  const results = [];
  let longTasks = 0;
  const hasLongTasks = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("longtask");
  const observer = hasLongTasks ? new PerformanceObserver(list => { longTasks += list.getEntries().length; }) : undefined;
  observer?.observe({ type: "longtask" });
  try {
    for (const [name, batch] of Object.entries(createReplayCorpus())) {
      const expected = JSON.stringify(canonical(batch));
      for (const codec of ["v1", "defaults", "dictionary"]) {
        const times = [], encodeTimes = [], decodeTimes = [];
        let rawBytes, gzipBytes;
        for (let i = -3; i < attempts; i++) {
          const started = performance.now();
          const wire = codec === "v1" ? batch : encodeExperiment(batch, codec);
          const json = JSON.stringify(wire);
          const encodeMs = performance.now() - started;
          const blob = new Blob([json]);
          const compressed = await new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
          const elapsed = performance.now() - started;
          const decodedText = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
          if (decodedText !== json) throw new Error(`Byte mismatch ${name}/${codec}`);
          const decodeStart = performance.now();
          const output = codec === "v1" ? JSON.parse(decodedText) : decodeExperiment(JSON.parse(decodedText));
          const decodeMs = performance.now() - decodeStart;
          if (JSON.stringify(canonical(output)) !== expected) throw new Error(`Semantic mismatch ${name}/${codec}`);
          rawBytes = blob.size; gzipBytes = compressed.byteLength;
          if (i >= 0) { times.push(elapsed); encodeTimes.push(encodeMs); decodeTimes.push(decodeMs); }
        }
        results.push({ name, codec, rawBytes, gzipBytes,
          uploadP95Ms: percentile(times, 0.95), encodeP95Ms: percentile(encodeTimes, 0.95),
          decodeP95Ms: percentile(decodeTimes, 0.95) });
      }
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    return { measurement: "synthetic native browser gzip; uploadP95 includes asynchronous scheduling, encode/decode are main-thread wall time",
      userAgent: navigator.userAgent, attempts, longTasks: hasLongTasks ? longTasks : null,
      heapBytes: performance.memory?.usedJSHeapSize ?? null, results };
  } finally { observer?.disconnect(); }
}
