import { FilterParams } from "@rybbit/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { clickhouseResolvedIdentifiedUserId } from "../../../services/userIdentity/userIdentityService.js";
import { enrichWithTraits, getTimeStatement } from "../utils/utils.js";
import { getFilterStatement } from "../utils/getFilterStatement.js";
import { analyticsRoute, runAnalyticsQuery } from "../utils/analyticsQuery.js";

export interface GetSessionLocationsRequest {
  Params: {
    siteId: string;
  };
  Querystring: FilterParams<{}>;
}

export const buildSessionLocationsQuery = (query: GetSessionLocationsRequest["Querystring"], siteId: number) => {
  const timeStatement = getTimeStatement(query);
  const filterStatement = getFilterStatement(query.filters, siteId, timeStatement);
  const resolvedIdentifiedUserId = clickhouseResolvedIdentifiedUserId("events");

  return `
WITH stuff AS (
    SELECT
        session_id,
        argMax(user_id, timestamp) AS user_id,
        argMax(${resolvedIdentifiedUserId}, timestamp) AS identified_user_id,
        any(lat) AS lat,
        any(lon) AS lon,
        any(city) AS city,
        any(country) AS country,
        min(timestamp) AS session_start
    FROM
        events
    WHERE
        site_id = {site:Int32}
        ${timeStatement}
        ${filterStatement}
    GROUP BY
        session_id
)
SELECT
    lat,
    lon,
    city,
    country,
    count() as count,
    argMax(session_id, session_start) AS sample_session_id,
    argMax(user_id, session_start) AS sample_user_id,
    argMax(identified_user_id, session_start) AS sample_identified_user_id,
    max(session_start) AS sample_session_start
from
    stuff
GROUP BY
    lat,
    lon,
    city,
    country`;
};

export const getSessionLocations = analyticsRoute<GetSessionLocationsRequest>(
  "session locations",
  async (req: FastifyRequest<GetSessionLocationsRequest>, res: FastifyReply) => {
    const { siteId } = req.params;

    const rows = await runAnalyticsQuery<{
      lat: number;
      lon: number;
      count: number;
      city: string;
      country: string;
      sample_session_id: string;
      sample_user_id: string;
      sample_identified_user_id: string;
      sample_session_start: string;
    }>({
      query: buildSessionLocationsQuery(req.query, Number(siteId)),
      params: {
        site: siteId,
      },
    });

    const dataWithTraits = await enrichWithTraits(
      rows.map(row => ({
        ...row,
        identified_user_id: row.sample_identified_user_id,
      })),
      Number(siteId)
    );

    const data = dataWithTraits.map(({ identified_user_id, traits, ...row }) => ({
      ...row,
      sample_traits: traits,
    }));

    return res.status(200).send({ data });
  }
);
