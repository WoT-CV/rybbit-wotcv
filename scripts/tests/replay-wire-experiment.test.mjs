import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createReplayCorpus } from "../lib/replay-corpus.mjs";
import { encodeExperiment, decodeExperiment } from "../lib/replay-wire-experiment.mjs";

for (const codec of ["defaults", "dictionary"]) {
  test(`${codec}: golden round-trip, no input mutation, all unknown data retained`, () => {
    for (const batch of Object.values(createReplayCorpus())) {
      const before = structuredClone(batch);
      assert.deepEqual(decodeExperiment(encodeExperiment(batch, codec)), before);
      assert.deepEqual(batch, before);
    }
  });
  test(`${codec}: presence/null/zero/false/empty states remain distinct (200 variants)`, () => {
    const variants = [undefined, null, 0, false, "", {}, [], "Zażółć 🐸", "__proto__", { constructor: "literal" }];
    for (let i = 0; i < 200; i++) {
      const batch = createReplayCorpus().small, request = batch.events[0].data.payload.requests[0];
      for (const [j, key] of ["requestHeaders", "responseHeaders", "schemaVersion", "captureMode", "url", "currentUrl"].entries()) {
        const value = variants[(i + j) % variants.length];
        if (value === undefined) delete request[key]; else request[key] = value;
      }
      assert.deepEqual(decodeExperiment(encodeExperiment(batch, codec)), batch);
    }
  });
  test(`${codec}: invalid indices, collisions, version, dictionary and budgets rejected`, () => {
    const wire = encodeExperiment(createReplayCorpus().metadata, codec);
    for (const ref of [[-1, 0, 0], [0, 0, "__proto__"], [0, 0, 999], [999999, 0, 0], [0, 0, 0, 999999]]) {
      assert.throws(() => decodeExperiment({ ...wire, references: [ref] }));
    }
    assert.throws(() => decodeExperiment({ ...wire, wireVersion: 3 }));
    assert.throws(() => decodeExperiment({ ...wire, references: [wire.references[0], wire.references[0]] }));
    assert.throws(() => encodeExperiment({ events: [], text: "x".repeat(7_000_001) }, codec));
    if (codec === "dictionary") {
      assert.throws(() => decodeExperiment({ ...wire, dictionary: [null] }));
      assert.throws(() => decodeExperiment({ ...wire, dictionary: Array(257).fill("x") }));
    }
    assert.equal(Object.prototype.polluted, undefined);
  });
}
