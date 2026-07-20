-- Reconcile both possible pre-merge database states. The feature and upstream
-- branches had diverging migrations with overlapping sequence numbers, so a
-- database may already contain either side. Keep every operation idempotent.
ALTER TABLE "apikey" DROP CONSTRAINT IF EXISTS "apikey_referenceId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "first_party_proxy" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "network_replay_config" jsonb DEFAULT '{"enabled":false,"captureFetch":true,"captureXhr":true,"capturePerformanceResources":true,"captureInitialPerformanceResources":true,"captureRequestHeaders":true,"captureResponseHeaders":true,"captureRequestBody":true,"captureResponseBody":true,"maxBodySizeBytes":1000000,"bodyReadTimeoutMs":1000,"maxNetworkEventSizeBytes":2500000,"maxReplayBatchSizeBytes":7000000}'::jsonb NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "user_aliases_anon_idx";
--> statement-breakpoint
ALTER TABLE "user_aliases" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_aliases" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_aliases" DROP CONSTRAINT IF EXISTS "user_aliases_source_check";
--> statement-breakpoint
ALTER TABLE "user_aliases" ADD CONSTRAINT "user_aliases_source_check" CHECK ("user_aliases"."source" in ('tracker', 'admin', 'legacy'));
