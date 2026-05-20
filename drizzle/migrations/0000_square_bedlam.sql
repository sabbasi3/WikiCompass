CREATE TABLE "journeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"topic" text NOT NULL,
	"level" text NOT NULL,
	"user_goal" text,
	"map_json" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"workflow_run_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"journey_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"questions_json" jsonb NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quizzes_journey_id_round_pk" PRIMARY KEY("journey_id","round")
);
--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journeys_active_unique" ON "journeys" USING btree ("email","topic") WHERE status = 'active';