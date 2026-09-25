// One-time, explicitly authorized configuration-only operation. Pipe over SSH:
// node --input-type=module - [--apply]
// Default: read-only. Pinned to the verified production release, never builds,
// pulls, invokes the migration entrypoint, or recreates dependent services.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const repo = "/home/rybbit-wotcv";
const expectedSha = "b05edf566c6211777c84f0375802fc40e08b82fd";
const expectedImage = "sha256:0fcdf6ff340c97a89c2312c00337899353f5aa2854802b2a635f40de8e89b3da";
const files = ["docker-compose.yml", "docker-compose.wotcv.yml", "docker-compose.wotcv.branch-build.yml"].map(
  f => `${repo}/${f}`
);
const names = ["backend", "client", "clickhouse", "postgres", "redis"];
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const run = (args, options = {}) =>
  execFileSync("docker", args, { encoding: "utf8", timeout: 45000, stdio: ["pipe", "pipe", "pipe"], ...options });
const inspect = () => JSON.parse(run(["inspect", ...names]));
const envOf = c =>
  Object.fromEntries(
    c.Config.Env.map(s => {
      const i = s.indexOf("=");
      return [s.slice(0, i), s.slice(i + 1)];
    })
  );
const receipt = cs =>
  cs.map(c => ({
    name: c.Name,
    id: c.Id,
    image: c.Image,
    started: c.State.StartedAt,
    status: c.State.Status,
    health: c.State.Health?.Status,
    restarts: c.RestartCount,
  }));
const getJson = async url => {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  assert.equal(r.status, 200, "HTTP status");
  return r.json();
};
const health = async () => {
  for (const base of ["http://127.0.0.1:3001", "https://tracking.wot-cv.com"]) {
    const h = await getJson(`${base}/api/health`);
    assert.equal(h.status, "ok", "Application health");
    assert.equal(h.gitSha, expectedSha, "Deployed SHA");
    assert.equal(h.imageDigest, expectedImage, "Deployed digest");
  }
};

async function main() {
  assert.ok(process.argv.length <= 3 && (!process.argv[2] || process.argv[2] === "--apply"), "Unsupported arguments");
  const before = inspect(),
    backend = before[0],
    client = before[1],
    be = envOf(backend),
    ce = envOf(client);
  assert.equal(backend.Image, expectedImage, "Unexpected running image");
  assert.equal(be.WOTCV_GIT_SHA, expectedSha, "Unexpected running SHA");
  assert.equal(be.WOTCV_REPLAY_UPLOAD_GZIP, "false", "Gzip must be explicitly disabled before this one-time operation");
  assert.equal(
    backend.Config.Labels["com.docker.compose.project.config_files"],
    files.join(","),
    "Unexpected Compose files"
  );
  assert.equal(backend.Config.Labels["com.docker.compose.project"], "rybbit", "Unexpected project");
  assert.deepEqual(backend.Config.Entrypoint, ["/app/docker-entrypoint.sh"], "Unexpected entrypoint");
  assert.deepEqual(backend.Config.Cmd, ["node", "dist/cluster.js"], "Unexpected command");
  for (const c of before) {
    assert.equal(c.State.Status, "running", "Container not running");
    if (c.State.Health) assert.equal(c.State.Health.Status, "healthy", "Container unhealthy");
  }
  const envPath = `${repo}/.env`,
    stat = lstatSync(envPath),
    original = readFileSync(envPath);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), "Unsafe env target");
  assert.equal(stat.uid, process.getuid(), "Unexpected env owner");
  assert.ok(
    !/^\s*(?:export\s+)?WOTCV_REPLAY_UPLOAD_GZIP\s*=/m.test(original.toString("utf8")),
    "Existing flag requires manual review"
  );
  const updated = Buffer.concat([
    original,
    Buffer.from(`${original.at(-1) === 10 ? "" : "\n"}WOTCV_REPLAY_UPLOAD_GZIP=true\n`),
  ]);
  const env = {
    ...process.env,
    COMPOSE_PROJECT_NAME: "rybbit",
    IMAGE_TAG: be.WOTCV_IMAGE_TAG,
    WOTCV_GIT_SHA: expectedSha,
    WOTCV_BUILD_TIME: be.WOTCV_BUILD_TIME,
    WOTCV_DEPLOYED_AT: be.WOTCV_DEPLOYED_AT,
    BACKEND_IMAGE_DIGEST: be.WOTCV_IMAGE_DIGEST,
    CLIENT_IMAGE_DIGEST: ce.WOTCV_IMAGE_DIGEST,
    WOTCV_REPLAY_UPLOAD_GZIP: "true",
  };
  const prefix = ["compose", "--project-name", "rybbit", ...files.flatMap(f => ["-f", f])];
  // Skip the startup shell (including migrations); DB health was checked above.
  // Retain the exact application command and the image's restart policy.
  const override = JSON.stringify({ services: { backend: { entrypoint: [], command: backend.Config.Cmd } } });
  const base = JSON.parse(run([...prefix, "config", "--format", "json"], { cwd: repo, env }));
  const candidate = JSON.parse(
    run([...prefix, "-f", "-", "config", "--format", "json"], { cwd: repo, env, input: override })
  );
  const image = JSON.parse(run(["image", "inspect", base.services.backend.image]))[0];
  assert.equal(image.Id, expectedImage, "Local tag changed");
  const mergedEnv = {
    ...envOf(image),
    ...Object.fromEntries(Object.entries(candidate.services.backend.environment).map(([k, v]) => [k, String(v)])),
  };
  const differences = [...new Set([...Object.keys(mergedEnv), ...Object.keys(be)])]
    .filter(k => mergedEnv[k] !== be[k])
    .sort();
  assert.deepEqual(differences, ["WOTCV_REPLAY_UPLOAD_GZIP"], "Unrelated environment changes");
  const normalized = structuredClone(candidate);
  normalized.services.backend.entrypoint = base.services.backend.entrypoint;
  normalized.services.backend.command = base.services.backend.command;
  assert.deepEqual(normalized, base, "Override changes more than entrypoint/command");
  await health();
  console.log(
    JSON.stringify({
      phase: "preflight",
      environmentDifferenceKeys: differences,
      image: expectedImage,
      skipMigrationEntrypoint: true,
      containers: receipt(before),
    })
  );
  if (process.argv[2] !== "--apply") return;

  const directory = mkdtempSync("/home/wotcv/tools/rybbit-gzip-20260925-");
  const record = {
    phase: "prepared",
    before: receipt(before),
    gitSha: expectedSha,
    image: expectedImage,
    originalEnvHash: sha(original),
    updatedEnvHash: sha(updated),
  };
  const save = () => writeFileSync(`${directory}/operation.json`, JSON.stringify(record, null, 2), { mode: 0o600 });
  writeFileSync(`${directory}/env.before`, original, { mode: 0o600, flag: "wx" });
  writeFileSync(`${directory}/compose-runtime.json`, override, { mode: 0o600, flag: "wx" });
  // Safe, non-secret values needed to reproduce this same-image operation.
  writeFileSync(
    `${directory}/compose-environment.json`,
    JSON.stringify(
      Object.fromEntries(
        Object.keys(env)
          .filter(k =>
            /^(COMPOSE_PROJECT_NAME|IMAGE_TAG|WOTCV_GIT_SHA|WOTCV_BUILD_TIME|WOTCV_DEPLOYED_AT|BACKEND_IMAGE_DIGEST|CLIENT_IMAGE_DIGEST|WOTCV_REPLAY_UPLOAD_GZIP)$/.test(
              k
            )
          )
          .map(k => [k, env[k]])
      ),
      null,
      2
    ),
    { mode: 0o600, flag: "wx" }
  );
  save();
  const replaceEnv = bytes => {
    const pending = `${repo}/.env.gzip-${directory.split("/").at(-1)}`;
    writeFileSync(pending, bytes, { mode: stat.mode & 0o777, flag: "wx" });
    renameSync(pending, envPath);
  };
  assert.equal(sha(readFileSync(envPath)), sha(original), "Concurrent env modification");
  assert.deepEqual(receipt(inspect()), receipt(before), "Containers changed during preflight");
  replaceEnv(updated);
  const up = flag =>
    run(
      [
        ...prefix,
        "-f",
        `${directory}/compose-runtime.json`,
        "up",
        "-d",
        "--no-deps",
        "--no-build",
        "--pull",
        "never",
        "backend",
      ],
      { cwd: repo, env: { ...env, WOTCV_REPLAY_UPLOAD_GZIP: flag } }
    );
  const waitHealthy = async flag => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const current = inspect();
      if (current[0].State.Health?.Status === "healthy") {
        assert.equal(current[0].Image, expectedImage, "Image changed");
        assert.equal(envOf(current[0]).WOTCV_REPLAY_UPLOAD_GZIP, flag, "Flag mismatch");
        assert.deepEqual(receipt(current.slice(1)), receipt(before.slice(1)), "Dependent services changed");
        await health();
        for (const origin of ["http://127.0.0.1:3001", "https://tracking.wot-cv.com"]) {
          const config = await getJson(`${origin}/api/site/tracking-config/3e894930d08d`);
          assert.deepEqual(config.replayTransport, { version: 1, gzip: flag === "true" }, "Capability mismatch");
        }
        return current;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error("Health deadline exceeded");
  };
  try {
    record.phase = "activating";
    save();
    up("true");
    const after = await waitHealthy("true");
    record.phase = "enabled";
    record.after = receipt(after);
    save();
    console.log(JSON.stringify({ phase: "enabled", auditDirectory: directory, containers: receipt(after) }));
  } catch {
    record.phase = "rollback-required";
    save();
    assert.equal(sha(readFileSync(envPath)), sha(updated), "Concurrent env modification prevents automatic rollback");
    replaceEnv(original);
    up("false");
    record.after = receipt(await waitHealthy("false"));
    record.phase = "rolled-back";
    save();
    console.log(JSON.stringify({ phase: record.phase, auditDirectory: directory }));
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error(
    "Operation stopped by a safety check; inspect the sanitized audit receipt. Raw environment and command output are intentionally withheld."
  );
  process.exitCode = 1;
});
