ALTER TABLE "apikey" DROP CONSTRAINT IF EXISTS "apikey_referenceId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "first_party_proxy" boolean DEFAULT false;
