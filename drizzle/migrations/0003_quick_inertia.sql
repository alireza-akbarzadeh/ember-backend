CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"postal_code" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "minimum_order_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "cuisines" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "price_level" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "rating_average" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "rating_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "preparation_minutes" integer DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_user_id_idx" ON "addresses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_one_default_per_user" ON "addresses" USING btree ("user_id") WHERE "addresses"."is_default";--> statement-breakpoint
CREATE INDEX "restaurants_location_idx" ON "restaurants" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "restaurants_rating_idx" ON "restaurants" USING btree ("rating_average");--> statement-breakpoint
CREATE INDEX "restaurants_cuisines_idx" ON "restaurants" USING gin ("cuisines");