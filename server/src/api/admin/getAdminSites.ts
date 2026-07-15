import { count, eq } from "drizzle-orm";
import { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../../db/postgres/postgres.js";
import { goals, funnels, member, user } from "../../db/postgres/schema.js";
import { getSiteEventCounts } from "../../services/admin/siteEventCountsService.js";
import { getOrganizationSubscriptions } from "../../services/admin/subscriptionService.js";

export async function getAdminSites(request: FastifyRequest, reply: FastifyReply) {
  // Get all sites (including organizationId for owner lookup)
  const sitesData = await db.query.sites.findMany({
    orderBy: (sites, { desc }) => [desc(sites.createdAt)],
  });

  // Get organization owners and their emails
  const orgOwners = await db
    .select({
      organizationId: member.organizationId,
      userId: member.userId,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.role, "owner"));

  // Create map of organization IDs to owner emails
  const orgOwnerMap = new Map();
  for (const owner of orgOwners) {
    orgOwnerMap.set(owner.organizationId, owner.email);
  }

  // Get organizations and their subscription data
  const organizationsData = await db.query.organization.findMany();
  const orgSubscriptionMap = await getOrganizationSubscriptions(organizationsData, false);

  const siteEventCounts = await getSiteEventCounts();

  // Get goal and funnel counts per site
  const goalCounts = await db.select({ siteId: goals.siteId, count: count() }).from(goals).groupBy(goals.siteId);

  const funnelCounts = await db
    .select({ siteId: funnels.siteId, count: count() })
    .from(funnels)
    .groupBy(funnels.siteId);

  const siteGoalCountMap = new Map<number, number>();
  for (const row of goalCounts) {
    siteGoalCountMap.set(row.siteId, row.count);
  }

  const siteFunnelCountMap = new Map<number, number>();
  for (const row of funnelCounts) {
    if (row.siteId != null) {
      siteFunnelCountMap.set(row.siteId, row.count);
    }
  }

  // Combine all data
  const enrichedSites = sitesData.map(site => {
    const subscription = site.organizationId
      ? orgSubscriptionMap.get(site.organizationId)
      : { planName: "free", status: "free" };

    return {
      siteId: site.siteId,
      name: site.name,
      type: site.type || "web",
      domain: site.domain || "",
      organizationId: site.organizationId,
      createdAt: site.createdAt,
      public: site.public,
      eventsLast24Hours: siteEventCounts.last24Hours.get(site.siteId) || 0,
      eventsLast30Days: siteEventCounts.last30Days.get(site.siteId) || 0,
      goalsCount: siteGoalCountMap.get(site.siteId) || 0,
      funnelsCount: siteFunnelCountMap.get(site.siteId) || 0,
      sessionReplay: site.sessionReplay ?? false,
      organizationOwnerEmail: site.organizationId ? orgOwnerMap.get(site.organizationId) : null,
      subscription: {
        planName: subscription?.planName || "free",
        status: subscription?.status || "free",
      },
    };
  });

  return reply.status(200).send(enrichedSites);
}
