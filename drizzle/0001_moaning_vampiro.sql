ALTER TABLE "projects" ALTER COLUMN "token_decimals" SET DATA TYPE integer USING token_decimals::integer;--> statement-breakpoint
CREATE INDEX "idx_wallets_user_id" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_whitelist_unique" ON "whitelist_entries" USING btree ("project_feature_id","wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_referrals_unique" ON "referrals" USING btree ("referrer_id","referred_id");