import { FastifyRequest, FastifyReply } from "fastify";
import { createRequire } from "module";
import { DISABLE_SIGNUP, LITE_DASHBOARD, MAPBOX_TOKEN } from "../lib/const.js";
import { runtimeCapabilities } from "../lib/runtimeCapabilities.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json");

export async function getConfig(_: FastifyRequest, reply: FastifyReply) {
  return reply.send({
    disableSignup: DISABLE_SIGNUP,
    mapboxToken: MAPBOX_TOKEN,
    liteDashboard: LITE_DASHBOARD,
    capabilities: runtimeCapabilities,
  });
}

export async function getVersion(_: FastifyRequest, reply: FastifyReply) {
  return reply.send({ version });
}
