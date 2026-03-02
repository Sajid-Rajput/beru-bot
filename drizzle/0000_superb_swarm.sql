CREATE TYPE "public"."ephemeral_status" AS ENUM('created', 'funded', 'swapping', 'completed', 'recovery_needed', 'recovered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."feature_status" AS ENUM('idle', 'pending', 'watching', 'executing', 'completed', 'stopped', 'error');--> statement-breakpoint
CREATE TYPE "public"."feature_type" AS ENUM('shadow_sell', 'monarch_limit', 'phantom_swap', 'legion_volume', 'eternal_dca');--> statement-breakpoint
CREATE TYPE "public"."fee_collection_status" AS ENUM('pending', 'collected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'sent', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."referral_tier" AS ENUM('none', 'supporter', 'shadow_elite', 'monarch');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'funding', 'swapping', 'sweeping', 'completed', 'failed', 'recovery_needed');--> statement-breakpoint
CREATE TYPE "public"."waitlist_status" AS ENUM('waiting', 'notified', 'activated');--> statement-breakpoint
CREATE TYPE "public"."wallet_source" AS ENUM('imported', 'generated');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" bigint NOT NULL,
	"username" varchar(255),
	"first_name" varchar(255),
	"referral_code" varchar(32) NOT NULL,
	"referred_by_user_id" uuid,
	"payout_wallet_address" varchar(64),
	"referral_tier" "referral_tier" DEFAULT 'none' NOT NULL,
	"fee_discount_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"public_key" varchar(64) NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"pk_iv" varchar(64) NOT NULL,
	"pk_auth_tag" varchar(64) NOT NULL,
	"dek_encrypted" text NOT NULL,
	"dek_iv" varchar(64) NOT NULL,
	"dek_auth_tag" varchar(64) NOT NULL,
	"dek_salt" varchar(64) NOT NULL,
	"source" "wallet_source" NOT NULL,
	"is_assigned" boolean DEFAULT false NOT NULL,
	"assigned_project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"token_mint" varchar(64) NOT NULL,
	"token_name" varchar(255),
	"token_symbol" varchar(32),
	"token_decimals" varchar(4),
	"dex_url" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"feature_type" "feature_type" NOT NULL,
	"status" "feature_status" DEFAULT 'idle' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_watching_transactions" boolean DEFAULT false NOT NULL,
	"pinned_message_id" integer,
	"last_market_cap_usd" numeric(20, 2),
	"total_sold_amount" numeric(20, 9) DEFAULT '0' NOT NULL,
	"total_sol_received" numeric(20, 9) DEFAULT '0' NOT NULL,
	"total_sell_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whitelist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_feature_id" uuid NOT NULL,
	"wallet_address" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_feature_id" uuid NOT NULL,
	"type" "feature_type" NOT NULL,
	"trigger_tx_signature" varchar(128),
	"sell_tx_signature" varchar(128),
	"token_amount_sold" numeric(20, 9),
	"sol_amount_received" numeric(20, 9),
	"sell_percentage" numeric(5, 2),
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"error_details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ephemeral_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"public_key" varchar(64) NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"pk_iv" varchar(64) NOT NULL,
	"pk_auth_tag" varchar(64) NOT NULL,
	"dek_encrypted" text NOT NULL,
	"dek_iv" varchar(64) NOT NULL,
	"dek_auth_tag" varchar(64) NOT NULL,
	"dek_salt" varchar(64) NOT NULL,
	"token_mint" varchar(64) NOT NULL,
	"main_wallet_public_key" varchar(64) NOT NULL,
	"status" "ephemeral_status" DEFAULT 'created' NOT NULL,
	"recovery_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"gross_sol" numeric(20, 9) NOT NULL,
	"gross_fee" numeric(20, 9) NOT NULL,
	"referral_discount" numeric(20, 9) DEFAULT '0' NOT NULL,
	"effective_fee" numeric(20, 9) NOT NULL,
	"tier1_referrer_share" numeric(20, 9) DEFAULT '0' NOT NULL,
	"tier1_referrer_id" uuid,
	"tier2_referrer_share" numeric(20, 9) DEFAULT '0' NOT NULL,
	"tier2_referrer_id" uuid,
	"platform_net" numeric(20, 9) NOT NULL,
	"collection_status" "fee_collection_status" DEFAULT 'pending' NOT NULL,
	"fee_tx_signature" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_ledger_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" uuid NOT NULL,
	"referred_id" uuid NOT NULL,
	"tier" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_sol" numeric(20, 9) NOT NULL,
	"payout_tx_signature" varchar(128),
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"earned_since_last_payout" numeric(20, 9) DEFAULT '0' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event_type" varchar(64) NOT NULL,
	"event_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" bigint NOT NULL,
	"username" text,
	"first_name" text,
	"position" integer NOT NULL,
	"referred_by" bigint,
	"referral_count" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'organic' NOT NULL,
	"status" "waitlist_status" DEFAULT 'waiting' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_user_id_users_id_fk" FOREIGN KEY ("referred_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_features" ADD CONSTRAINT "project_features_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whitelist_entries" ADD CONSTRAINT "whitelist_entries_project_feature_id_project_features_id_fk" FOREIGN KEY ("project_feature_id") REFERENCES "public"."project_features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_project_feature_id_project_features_id_fk" FOREIGN KEY ("project_feature_id") REFERENCES "public"."project_features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ephemeral_wallets" ADD CONSTRAINT "ephemeral_wallets_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_ledger" ADD CONSTRAINT "fee_ledger_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_ledger" ADD CONSTRAINT "fee_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_ledger" ADD CONSTRAINT "fee_ledger_tier1_referrer_id_users_id_fk" FOREIGN KEY ("tier1_referrer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_ledger" ADD CONSTRAINT "fee_ledger_tier2_referrer_id_users_id_fk" FOREIGN KEY ("tier2_referrer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_users_id_fk" FOREIGN KEY ("referred_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_payouts" ADD CONSTRAINT "referral_payouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_referred_by_waitlist_entries_telegram_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."waitlist_entries"("telegram_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_projects_user_token" ON "projects" USING btree ("user_id","token_mint") WHERE "projects"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_project_features_status" ON "project_features" USING btree ("status") WHERE "project_features"."status" IN ('pending', 'watching', 'executing');--> statement-breakpoint
CREATE INDEX "idx_project_features_watching" ON "project_features" USING btree ("is_watching_transactions") WHERE "project_features"."is_watching_transactions" = true;--> statement-breakpoint
CREATE INDEX "idx_transactions_status" ON "transactions" USING btree ("status") WHERE "transactions"."status" NOT IN ('completed', 'failed');--> statement-breakpoint
CREATE INDEX "idx_ephemeral_wallets_recovery" ON "ephemeral_wallets" USING btree ("status") WHERE "ephemeral_wallets"."status" = 'recovery_needed';--> statement-breakpoint
CREATE INDEX "idx_fee_ledger_pending" ON "fee_ledger" USING btree ("collection_status") WHERE "fee_ledger"."collection_status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_audit_log_user_time" ON "audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_waitlist_position" ON "waitlist_entries" USING btree ("position");--> statement-breakpoint
CREATE INDEX "idx_waitlist_referred_by" ON "waitlist_entries" USING btree ("referred_by");--> statement-breakpoint
CREATE INDEX "idx_waitlist_status" ON "waitlist_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_waitlist_source" ON "waitlist_entries" USING btree ("source");