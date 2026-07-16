DROP INDEX "user_aliases_anon_idx";--> statement-breakpoint
ALTER TABLE "user_aliases" ADD COLUMN "source" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_aliases" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_aliases" ADD CONSTRAINT "user_aliases_source_check" CHECK ("user_aliases"."source" in ('tracker', 'admin', 'legacy'));