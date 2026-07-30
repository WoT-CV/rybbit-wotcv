import { IDENTITY_RESOLUTION_V2, IS_CLOUD, LITE_DASHBOARD } from "../../lib/const.js";
import { initializeAdminEventRollup } from "./adminEventRollup.js";
import { clickhouse } from "./client.js";
import { USER_IDENTITY_DICTIONARY } from "./identityDictionary.js";
import { clickhouseInitLogger } from "./initUtils.js";
import { initializeCloudTables } from "./schema/cloud.js";
import { initializeCoreTables } from "./schema/core.js";
import { initializeLiteDashboardMVs } from "./schema/liteDashboard.js";

export { clickhouse } from "./client.js";

export const initializeClickhouse = async () => {
  await initializeCoreTables();
  await initializeAdminEventRollup(clickhouse);

  if (IS_CLOUD) {
    await initializeCloudTables();
  }

  if (IDENTITY_RESOLUTION_V2) {
    const dictionaryCheck = await clickhouse.query({
      query: `SELECT dictGetOrDefault('${USER_IDENTITY_DICTIONARY}', 'user_id', tuple(toUInt64(0), ''), '') AS user_id`,
      format: "JSONEachRow",
    });
    await dictionaryCheck.json();
    clickhouseInitLogger.info({ dictionary: USER_IDENTITY_DICTIONARY }, "Identity dictionary is available");
  }

  if (LITE_DASHBOARD) {
    await initializeLiteDashboardMVs();
  }
};
