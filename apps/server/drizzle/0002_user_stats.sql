CREATE TABLE "user_stats" (
	"user_id" uuid NOT NULL,
	"game_type" text NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"chip_net" bigint DEFAULT 0 NOT NULL,
	"best_win" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_stats_user_id_game_type_pk" PRIMARY KEY("user_id","game_type")
);
--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- 이미 기록된 판의 전적을 누적 전적으로 옮긴다
INSERT INTO "user_stats" ("user_id", "game_type", "played", "wins", "chip_net", "best_win")
SELECT p."user_id", r."game_type", count(*)::int, count(*) FILTER (WHERE p."chip_delta" > 0)::int,
       coalesce(sum(p."chip_delta"), 0), greatest(coalesce(max(p."chip_delta"), 0), 0)
FROM "game_result_players" p JOIN "game_results" r ON r."game_id" = p."game_id"
GROUP BY p."user_id", r."game_type";
