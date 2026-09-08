import { FilterParams } from "@rybbit/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { clickhouseResolvedIdentifiedUserId } from "../../../services/userIdentity/userIdentityService.js";
import { enrichWithTraits } from "../utils/utils.js";
import { getTimeStatement } from "../utils/timeWindow.js";
import { buildFilteredSessionsCTE } from "../utils/sessionFilters.js";
import { analyticsRoute, runAnalyticsQuery } from "../utils/analyticsQuery.js";

export interface GetSessionLocationsRequest {
  Params: {
    siteId: string;
  };
  Querystring: FilterParams<{}>;
}

export const buildSessionLocationsQuery = (query: GetSessionLocationsRequest["Querystring"], siteId: number) => {
  const timeStatement = getTimeStatement(query);
  const resolvedIdentifiedUserId = clickhouseResolvedIdentifiedUserId("events");
  const filteredSessionsCTE = buildFilteredSessionsCTE(query.filters, siteId, timeStatement);
  const filteredSessionsJoin = filteredSessionsCTE ? "INNER JOIN FilteredSessions USING (session_id)" : "";

  return `
WITH ${filteredSessionsCTE ? `${filteredSessionsCTE},` : ""}
stuff AS (
    SELECT
        session_id,
        argMax(events.user_id, timestamp_ms) AS user_id,
        argMax(${resolvedIdentifiedUserId}, timestamp_ms) AS identified_user_id,
        argMax(lat, timestamp) AS lat,
        argMax(lon, timestamp) AS lon,
        argMax(city, timestamp) AS city,
        argMax(country, timestamp) AS country,
        min(timestamp) AS session_start
    FROM
        events
    ${filteredSessionsJoin}
    WHERE
        site_id = {site:Int32}
        ${timeStatement}
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
