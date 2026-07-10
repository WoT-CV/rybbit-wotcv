import { FilterParams } from "@rybbit/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { clickhouse } from "../../../db/clickhouse/clickhouse.js";
import { enrichWithTraits, getTimeStatement, processResults } from "../utils/utils.js";
import { getFilterStatement } from "../utils/getFilterStatement.js";

export async function getSessionLocations(
  req: FastifyRequest<{
    Params: {
      siteId: string;
    };
    Querystring: FilterParams<{}>;
  }>,
  res: FastifyReply
) {
  const { siteId } = req.params;

  const timeStatement = getTimeStatement(req.query);
  const filterStatement = getFilterStatement(req.query.filters, Number(siteId), timeStatement);

  const result = await clickhouse.query({
    query: `
WITH stuff AS (
    SELECT
        session_id,
        argMax(user_id, timestamp) AS user_id,
        argMax(identified_user_id, timestamp) AS identified_user_id,
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
    country`,
    query_params: {
      site: siteId,
    },
    format: "JSONEachRow",
  });

  const rows = await processResults<{
    lat: number;
    lon: number;
    count: number;
    city: string;
    country: string;
    sample_session_id: string;
    sample_user_id: string;
    sample_identified_user_id: string;
    sample_session_start: string;
  }>(result);

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
