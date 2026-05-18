DROP INDEX "idx_ephemeral_wallets_recovery";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "funding_tx_signature" varchar(128);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "sweep_tx_signature" varchar(128);--> statement-breakpoint
CREATE INDEX "idx_transactions_recovery" ON "transactions" USING btree ("status") WHERE "transactions"."status" = 'recovery_needed';--> statement-breakpoint
ALTER TABLE "ephemeral_wallets" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "ephemeral_wallets" DROP COLUMN "recovery_attempts";--> statement-breakpoint
DROP TYPE "public"."ephemeral_status";