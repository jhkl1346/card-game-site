CREATE TABLE "table_stakes" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_stakes_amount_nonnegative" CHECK ("table_stakes"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "table_stakes" ADD CONSTRAINT "table_stakes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;