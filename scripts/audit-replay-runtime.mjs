// Read-only, counter/allowlist-only production audit. Can be piped over SSH.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const LOCAL = "http://127.0.0.1:3001";
const PUBLIC = "https://tracking.wot-cv.com";
const FRONTEND = "https://wot-cv.com";
const CONFIG_PATH = "/api/site/tracking-config/3e894930d08d";
const NAMES = ["backend", "client", "clickhouse", "postgres", "redis"];
const LIMITS = {
  maxBodySizeBytes: 1000000,
  bodyReadTimeoutMs: 1000,
  maxNetworkEventSizeBytes: 2500000,
  maxReplayBatchSizeBytes: 7000000,
};
const validSha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const safeSha = value => (typeof value === "string" && /^[a-f0-9]{7,40}$/.test(value) ? value : null);
const safeDigest = value => (typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value) ? value : null);
const maybe = async operation => {
  try {
    return await operation();
  } catch {
    return null;
  }
};
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 2 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });

export function classifyReplayRuntime(observation) {
  const {
    containers,
    localHealth,
    publicHealth,
    localConfig,
    publicConfig,
    cors,
    version,
    frontendMetadataTag,
    beArtifact,
  } = observation;
  const be = containers?.find(c => c.name === "backend"),
    client = containers?.find(c => c.name === "client");
  const problems = [],
    warnings = [];
  const deploymentMatches =
    [localHealth, publicHealth].every(
      h => h?.status === "ok" && validSha(h.gitSha) && h.gitSha === be?.gitSha && h.imageDigest === be?.imageId
    ) &&
    validSha(client?.gitSha) &&
    be?.gitSha === client.gitSha &&
    safeDigest(be?.imageId) &&
    safeDigest(client?.imageId) &&
    be.imageTag === `ghcr.io/wot-cv/rybbit-wotcv-backend:sha-${be.gitSha}` &&
    client.imageTag === `ghcr.io/wot-cv/rybbit-wotcv-client:sha-${client.gitSha}`;
  if (!deploymentMatches) problems.push("deployment_mismatch_or_unavailable");
  const applicationVersion = typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version) ? version : null;
  if (!applicationVersion) problems.push("application_version_unavailable");
  const states = NAMES.map(name => {
    const c = containers?.find(c => c.name === name);
    const healthy =
      c?.status === "running" &&
      c.oomKilled === false &&
      (name === "client" ? !c.health || c.health === "healthy" : c.health === "healthy");
    if (!healthy) problems.push(`${name}_not_healthy_or_unavailable`);
    if (Number.isInteger(c?.restarts) && c.restarts > 0) warnings.push(`${name}_has_restarted`);
    return {
      name,
      healthy,
      imageId: safeDigest(c?.imageId),
      restarts: Number.isInteger(c?.restarts) && c.restarts >= 0 ? c.restarts : null,
    };
  });
  const capability = config =>
    config?.replayTransport?.version === 1 && typeof config.replayTransport.gzip === "boolean"
      ? config.replayTransport.gzip
      : null;
  const advertised = [capability(localConfig), capability(publicConfig)];
  const configured = be?.gzip === "true" ? true : be?.gzip === "false" ? false : null;
  const gzip =
    configured === null || advertised.includes(null)
      ? "unknown"
      : advertised.some(v => v !== configured)
        ? "mismatch"
        : configured
          ? "enabled"
          : "disabled";
  if (["unknown", "mismatch"].includes(gzip)) problems.push(`gzip_${gzip}`);
  if (gzip === "disabled") warnings.push("gzip_disabled");
  if (localConfig?.sessionReplay !== true || publicConfig?.sessionReplay !== true)
    problems.push("site_replay_disabled_or_unavailable");
  for (const config of [localConfig, publicConfig]) {
    if (
      !config?.networkReplay ||
      Object.entries(LIMITS).some(
        ([key, ceiling]) =>
          !Number.isSafeInteger(config.networkReplay[key]) ||
          config.networkReplay[key] <= 0 ||
          config.networkReplay[key] > ceiling
      )
    ) {
      problems.push("replay_limits_missing_or_increased");
      break;
    }
  }
  if (
    localConfig?.networkReplay &&
    publicConfig?.networkReplay &&
    Object.keys(LIMITS).some(key => localConfig.networkReplay[key] !== publicConfig.networkReplay[key])
  )
    problems.push("local_public_replay_limits_differ");
  if (frontendMetadataTag !== true) problems.push("frontend_metadata_tag_not_observed");
  const corsOk =
    cors?.status === 204 &&
    cors.origin === FRONTEND &&
    cors.credentials !== "true" &&
    typeof cors.headers === "string" &&
    cors.headers
      .toLowerCase()
      .split(/\s*,\s*/)
      .includes("content-encoding") &&
    cors.headers
      .toLowerCase()
      .split(/\s*,\s*/)
      .includes("content-type") &&
    typeof cors.methods === "string" &&
    cors.methods.split(/\s*,\s*/).includes("POST");
  if (!corsOk) problems.push("gzip_cors_not_confirmed");
  const runtimeSha = safeSha(beArtifact?.runtimeSha),
    checkoutSha = safeSha(beArtifact?.checkoutSha);
  const provenance =
    !runtimeSha || !checkoutSha
      ? "unknown"
      : runtimeSha.startsWith(checkoutSha) || checkoutSha.startsWith(runtimeSha)
        ? "matches"
        : "mismatch";
  if (provenance !== "matches") warnings.push(`be_checkout_runtime_${provenance}`);
  return {
    ok: problems.length === 0,
    gzip,
    deployedSha: safeSha(be?.gitSha),
    applicationVersion,
    containers: states,
    cors: corsOk,
    frontendMetadataTagObserved: frontendMetadataTag === true,
    beArtifact: { runtimeSha, checkoutSha, provenance },
    problems,
    warnings,
    actualCompressedTrafficMeasured: false,
    durableHttpBodyCoverageConfirmed: false,
  };
}

export async function boundedText(response, limit = 512 * 1024) {
  if (!response.ok) throw new Error("HTTP audit request failed");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing HTTP body");
  let bytes = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error("HTTP audit response exceeds bound");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function hasMetadataTrackerTag(html) {
  // Observation of the published tag, not proof that a browser executed it.
  for (const match of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<script\b([^>]*)>/gi)) {
    const attributes = Object.fromEntries(
      [...match[1].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => [m[1].toLowerCase(), m[2] ?? m[3]])
    );
    if (attributes.src === `${PUBLIC}/api/script.js` && attributes["data-replay-network-mode"] === "metadata")
      return true;
  }
  return false;
}

function inspectContainers() {
  return JSON.parse(run("docker", ["inspect", ...NAMES])).map(c => {
    const env = Object.fromEntries(
      c.Config.Env.map(s => {
        const i = s.indexOf("=");
        return [s.slice(0, i), s.slice(i + 1)];
      })
    );
    return {
      name: c.Name.slice(1),
      status: c.State.Status,
      health: c.State.Health?.Status,
      restarts: c.RestartCount,
      oomKilled: c.State.OOMKilled,
      imageId: c.Image,
      imageTag: c.Config.Image,
      gitSha: env.WOTCV_GIT_SHA,
      gzip: env.WOTCV_REPLAY_UPLOAD_GZIP,
    };
  });
}

function inspectBeArtifact() {
  // Only read the running JAR's small git.properties entry, never the environment
  // or application.yml. Source checkout is reported separately, never substituted.
  const script = `import json,os,pathlib,re,subprocess,zipfile
pid=subprocess.check_output(['systemctl','show','wotcv-be-prod.service','--property=MainPID','--value'],timeout=5,text=True).strip()
assert re.fullmatch(r'[1-9][0-9]*',pid)
args=pathlib.Path('/proc/'+pid+'/cmdline').read_bytes().split(b'\\0')
jar=pathlib.Path(args[args.index(b'-jar')+1].decode()).resolve()
assert jar.is_relative_to('/home/wotcv/prod/wot-cv-be/application/target')
fds=pathlib.Path('/proc/'+pid+'/fd')
opened=next(fd for fd in fds.iterdir() if os.readlink(fd) in [str(jar),str(jar)+' (deleted)'])
with zipfile.ZipFile(opened) as z:
 info=z.getinfo('BOOT-INF/classes/git.properties')
 assert info.file_size<=16384
 properties=z.read(info).decode()
values=dict(line.split('=',1) for line in properties.splitlines() if '=' in line and not line.startswith('#'))
runtime=values.get('git.commit.id.full') or values.get('git.commit.id') or values.get('git.commit.id.abbrev')
checkout=subprocess.check_output(['git','-C','/home/wotcv/prod/wot-cv-be','rev-parse','HEAD'],timeout=5,text=True).strip()
assert re.fullmatch(r'[a-f0-9]{7,40}',runtime or '') and re.fullmatch(r'[a-f0-9]{40}',checkout)
print(json.dumps({'runtimeSha':runtime,'checkoutSha':checkout}))`;
  return JSON.parse(run("python3", ["-c", script]));
}

export async function auditReplayRuntime(
  fetcher = fetch,
  inspectors = { containers: inspectContainers, beArtifact: inspectBeArtifact }
) {
  const get = async url => boundedText(await fetcher(url, { signal: AbortSignal.timeout(10000) }));
  const json = async url => JSON.parse(await get(url));
  const [containers, beArtifact, localHealth, publicHealth, localConfig, publicConfig, versionResult, frontend, cors] =
    await Promise.all([
      maybe(inspectors.containers),
      maybe(inspectors.beArtifact),
      maybe(() => json(`${LOCAL}/api/health`)),
      maybe(() => json(`${PUBLIC}/api/health`)),
      maybe(() => json(`${LOCAL}${CONFIG_PATH}`)),
      maybe(() => json(`${PUBLIC}${CONFIG_PATH}`)),
      maybe(() => json(`${PUBLIC}/api/version`)),
      maybe(() => get(FRONTEND)),
      maybe(async () => {
        const r = await fetcher(`${PUBLIC}/api/session-replay/record/3e894930d08d`, {
          method: "OPTIONS",
          signal: AbortSignal.timeout(10000),
          headers: {
            Origin: FRONTEND,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,content-encoding",
          },
        });
        await r.body?.cancel();
        return {
          status: r.status,
          origin: r.headers.get("access-control-allow-origin"),
          credentials: r.headers.get("access-control-allow-credentials"),
          headers: r.headers.get("access-control-allow-headers"),
          methods: r.headers.get("access-control-allow-methods"),
        };
      }),
    ]);
  return classifyReplayRuntime({
    containers,
    beArtifact,
    localHealth,
    publicHealth,
    localConfig,
    publicConfig,
    version: versionResult?.version,
    frontendMetadataTag: typeof frontend === "string" && hasMetadataTrackerTag(frontend),
    cors,
  });
}

if (process.argv[1] === "-" || (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) {
  if (process.argv.slice(2).join(" ") !== "--live") {
    console.error("Usage: node scripts/audit-replay-runtime.mjs --live (on the production SSH host; read-only)");
    process.exitCode = 1;
  } else {
    try {
      const report = await auditReplayRuntime();
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
    } catch {
      console.error("Replay runtime audit failed; raw output suppressed");
      process.exitCode = 1;
    }
  }
}
