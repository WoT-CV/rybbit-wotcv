import { DateTime } from "luxon";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { clickhouse } from "../../db/clickhouse/clickhouse.js";
import { processResults } from "./utils/utils.js";

type GrowthAccountingMode = "day" | "week";

interface GrowthAccountingRow {
  period: string;
  new_users: number;
  returning_users: number;
  resurrecting_users: number;
  dormant_users: number;
}

export interface GrowthAccountingPoint {
  period: string;
  newUsers: number;
  returningUsers: number;
  resurrectingUsers: number;
  dormantUsers: number;
}

const querySchema = z.object({
  mode: z.enum(["day", "week"]).default("week"),
  range: z.coerce.number().int().min(7).max(365).default(90),
  timeZone: z
    .string()
    .default("UTC")
    .refine(value => {
      try {
        Intl.DateTimeFormat("en-US", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, "Invalid timeZone"),
});

export const getGrowthAccounting = async (
  request: FastifyRequest<{
    Params: { siteId: string };
    Querystring: { mode?: string; range?: string; timeZone?: string };
  }>,
  reply: FastifyReply
) => {
  const siteId = Number(request.params.siteId);
  if (!Number.isInteger(siteId) || siteId <= 0 || siteId > 65535) {
    return reply.status(400).send({ error: "Invalid site ID" });
  }

  const parsedQuery = querySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    return reply.status(400).send({ error: parsedQuery.error.errors[0]?.message ?? "Invalid query" });
  }

  const { mode, range, timeZone } = parsedQuery.data;
  const periodUnit = mode === "day" ? "day" : "week";
  const now = DateTime.now().setZone(timeZone);
  const rangeStart = now.startOf("day").minus({ days: range - 1 });
  const displayStart = mode === "day" ? rangeStart.startOf("day") : rangeStart.startOf("week");
  const displayEnd = mode === "day" ? now.startOf("day") : now.startOf("week");
  const activityStart = displayStart.minus({ [periodUnit]: 1 });
  const activityEnd = displayEnd.plus({ [periodUnit]: 1 });

  const periodExpression =
    mode === "day"
      ? "toStartOfDay(toTimeZone(timestamp, {timeZone:String}))"
      : "toStartOfWeek(toTimeZone(timestamp, {timeZone:String}), 1)";
  const firstPeriodExpression =
    mode === "day"
      ? "toStartOfDay(toTimeZone(min(timestamp), {timeZone:String}))"
      : "toStartOfWeek(toTimeZone(min(timestamp), {timeZone:String}), 1)";
  const previousPeriodExpression =
    mode === "day" ? "addDays(current_activity.activity_period, -1)" : "addWeeks(current_activity.activity_period, -1)";
  const nextPeriodExpression =
    mode === "day" ? "addDays(previous_activity.activity_period, 1)" : "addWeeks(previous_activity.activity_period, 1)";

  const result = await clickhouse.query({
    query: `
WITH
FirstActivity AS (
    SELECT
        COALESCE(NULLIF(identified_user_id, ''), user_id) AS effective_user_id,
        toDateTime(${firstPeriodExpression}) AS first_period
    FROM events
    PREWHERE site_id = {siteId:UInt16}
    WHERE COALESCE(NULLIF(identified_user_id, ''), user_id) != ''
    GROUP BY effective_user_id
),
PeriodActivity AS (
    SELECT
        COALESCE(NULLIF(identified_user_id, ''), user_id) AS effective_user_id,
        toDateTime(${periodExpression}) AS activity_period,
        toUInt8(1) AS active
    FROM events
    PREWHERE site_id = {siteId:UInt16}
    WHERE timestamp >= {activityStart:DateTime}
      AND timestamp < {activityEnd:DateTime}
      AND COALESCE(NULLIF(identified_user_id, ''), user_id) != ''
    GROUP BY effective_user_id, activity_period
),
ActiveAccounting AS (
    SELECT
        current_activity.activity_period AS period,
        countIf(first.first_period = current_activity.activity_period) AS new_users,
        countIf(previous_activity.active = 1) AS returning_users,
        countIf(first.first_period < current_activity.activity_period AND previous_activity.active = 0) AS resurrecting_users
    FROM PeriodActivity current_activity
    INNER JOIN FirstActivity first ON first.effective_user_id = current_activity.effective_user_id
    LEFT JOIN PeriodActivity previous_activity
      ON previous_activity.effective_user_id = current_activity.effective_user_id
     AND previous_activity.activity_period = ${previousPeriodExpression}
    WHERE current_activity.activity_period >= toDateTime({displayStart:String}, {timeZone:String})
      AND current_activity.activity_period <= toDateTime({displayEnd:String}, {timeZone:String})
    GROUP BY period
),
DormantAccounting AS (
    SELECT
        ${nextPeriodExpression} AS period,
        countIf(current_activity.active = 0) AS dormant_users
    FROM PeriodActivity previous_activity
    LEFT JOIN PeriodActivity current_activity
      ON current_activity.effective_user_id = previous_activity.effective_user_id
     AND current_activity.activity_period = ${nextPeriodExpression}
    WHERE previous_activity.activity_period >= toDateTime({activityDisplayStart:String}, {timeZone:String})
      AND ${nextPeriodExpression} <= toDateTime({displayEnd:String}, {timeZone:String})
    GROUP BY period
)
SELECT
    formatDateTime(period, '%F') AS period,
    sum(new_users) AS new_users,
    sum(returning_users) AS returning_users,
    sum(resurrecting_users) AS resurrecting_users,
    sum(dormant_users) AS dormant_users
FROM (
    SELECT
        period,
        new_users,
        returning_users,
        resurrecting_users,
        toUInt64(0) AS dormant_users
    FROM ActiveAccounting
    UNION ALL
    SELECT
        period,
        toUInt64(0) AS new_users,
        toUInt64(0) AS returning_users,
        toUInt64(0) AS resurrecting_users,
        dormant_users
    FROM DormantAccounting
)
GROUP BY period
ORDER BY period ASC
    `,
    format: "JSONEachRow",
    query_params: {
      siteId,
      timeZone,
      activityStart: activityStart.toUTC().toFormat("yyyy-MM-dd HH:mm:ss"),
      activityEnd: activityEnd.toUTC().toFormat("yyyy-MM-dd HH:mm:ss"),
      activityDisplayStart: activityStart.toFormat("yyyy-MM-dd HH:mm:ss"),
      displayStart: displayStart.toFormat("yyyy-MM-dd HH:mm:ss"),
      displayEnd: displayEnd.toFormat("yyyy-MM-dd HH:mm:ss"),
    },
    clickhouse_settings: {
      max_execution_time: 10,
      readonly: "2",
    },
  });

  const rows = await processResults<GrowthAccountingRow>(result);
  const rowsByPeriod = new Map(rows.map(row => [row.period, row]));
  const data: GrowthAccountingPoint[] = [];

  for (let period = displayStart; period <= displayEnd; period = period.plus({ [periodUnit]: 1 })) {
    const periodKey = period.toISODate() ?? period.toFormat("yyyy-MM-dd");
    const row = rowsByPeriod.get(periodKey);

    data.push({
      period: periodKey,
      newUsers: row?.new_users ?? 0,
      returningUsers: row?.returning_users ?? 0,
      resurrectingUsers: row?.resurrecting_users ?? 0,
      dormantUsers: row?.dormant_users ?? 0,
    });
  }

  return reply.send({ data, mode, range });
};
