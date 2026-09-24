/** Synthetic data only. Never replace these fixtures with production recordings. */
export function createReplayCorpus() {
  const timestamp = 1_790_000_000_000;
  const request = (index, full = false) => ({
    schemaVersion: 1,
    captureMode: full ? "full" : "metadata",
    requestId: `synthetic-${index}`,
    currentUrl: "https://example.test/players",
    url: `https://api.example.test/players/${index % 7}`,
    method: "GET",
    initiatorType: "fetch",
    startedAt: timestamp + index * 100,
    completedAt: timestamp + index * 100 + 10.125,
    durationMs: 10.125,
    status: index % 11 === 0 ? 401 : 200,
    outcome: index % 11 === 0 ? "http_error" : "success",
    requestHeaders: {},
    responseHeaders: full ? { "content-type": "application/json" } : {},
    correlationId: `synthetic-correlation-${index}`,
    performanceEntryFound: true,
    timing: { startTime: index * 100, responseStart: index * 100 + 8.5, duration: 10.125 },
    sizes: { transferSize: 0, encodedBodySize: 128, decodedBodySize: 256 },
    ...(full ? { responseBody: { kind: "json", value: '{"text":"Zażółć 🐸","n":0}' } } : {}),
  });
  const network = (index, full = false) => ({
    type: 6,
    timestamp: timestamp + index * 100,
    sequenceNumber: index,
    data: { plugin: "rrweb/network@1", payload: { version: 1, requests: [request(index, full)] } },
  });
  const envelope = (events) => ({
    userId: "synthetic-user",
    anonymousId: "synthetic-anonymous",
    metadata: { pageUrl: "https://example.test/players", viewportWidth: 390, viewportHeight: 844, language: "pl" },
    events,
  });
  return {
    small: envelope([network(0)]),
    metadata: envelope(Array.from({ length: 150 }, (_, index) => network(index))),
    legacy: envelope(Array.from({ length: 40 }, (_, index) => network(index, true))),
    mixed: envelope([
      { type: 4, timestamp, sequenceNumber: 0, data: { href: "https://example.test/", width: 390, height: 844 } },
      {
        type: 2,
        timestamp,
        sequenceNumber: 1,
        data: {
          node: {
            id: 1,
            type: 0,
            childNodes: Array.from({ length: 1200 }, (_, index) => ({
              type: 2, id: index * 2 + 2, tagName: "div", attributes: { class: "synthetic-player-row" },
              childNodes: [{ type: 3, id: index * 2 + 3, textContent: `Gracz ${index} — Zażółć gęślą jaźń 🐸` }],
            })),
          },
          initialOffset: { left: 0, top: 0 },
        },
      },
      { type: 3, timestamp: timestamp + 1, sequenceNumber: 2, data: { source: 3, id: 2, x: 0, y: 15.125 } },
      { ...network(3), data: { plugin: "unknown-plugin", payload: { empty: "", nil: null, zero: 0, values: [false, "ą"] } } },
      ...Array.from({ length: 60 }, (_, index) => network(index + 4)),
    ]),
  };
}
