ALTER TABLE "transactions" ADD COLUMN "job_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recovery_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "last_attempt_at" timestamp with time zone;