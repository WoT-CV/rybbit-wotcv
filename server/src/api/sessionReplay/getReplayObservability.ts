import type { FastifyReply, FastifyRequest } from "fastify";

import { parseReplayObservabilityProfiles } from "../../lib/replayObservability.js";

export async function getReplayObservability(
  request: FastifyRequest<{ Params: { siteId: string } }>,
  reply: FastifyReply
) {
  reply.header("Cache-Control", "private, no-store");
  try {
    const profiles = parseReplayObservabilityProfiles(
      process.env.WOTCV_REPLAY_OBSERVABILITY_PROFILES,
      Number(request.params.siteId)
    );
    return reply.send({ profiles });
  } catch {
    request.log.warn("Invalid WOTCV_REPLAY_OBSERVABILITY_PROFILES; observability links disabled");
    return reply.status(503).send({ error: "Replay observability configuration is unavailable" });
  }
}
