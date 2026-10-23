-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DiaryStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(150),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "theme" VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "diaries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mood_id" UUID,
    "title" VARCHAR(255),
    "content" TEXT NOT NULL DEFAULT '',
    "diary_date" DATE NOT NULL,
    "status" "DiaryStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "diaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moods" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "emoji" VARCHAR(20) NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "moods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_tags" (
    "diary_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "diary_tags_pkey" PRIMARY KEY ("diary_id","tag_id")
);

-- CreateTable
CREATE TABLE "diary_images" (
    "id" UUID NOT NULL,
    "diary_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(255),
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diary_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_upload_intents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "diary_id" UUID NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_upload_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_delete_jobs" (
    "id" UUID NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_delete_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_buckets" (
    "key" VARCHAR(100) NOT NULL,
    "hits" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "diaries_user_id_diary_date_idx" ON "diaries"("user_id", "diary_date" DESC);

-- CreateIndex
CREATE INDEX "diaries_user_id_status_idx" ON "diaries"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "diaries_id_user_id_key" ON "diaries"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "moods_code_key" ON "moods"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tags_id_user_id_key" ON "tags"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_user_id_name_key" ON "tags"("user_id", "name");

-- CreateIndex
CREATE INDEX "diary_tags_tag_id_idx" ON "diary_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "diary_images_object_key_key" ON "diary_images"("object_key");

-- CreateIndex
CREATE INDEX "diary_images_user_id_diary_id_idx" ON "diary_images"("user_id", "diary_id");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "image_upload_intents_object_key_key" ON "image_upload_intents"("object_key");

-- CreateIndex
CREATE INDEX "image_upload_intents_status_expires_at_idx" ON "image_upload_intents"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "storage_delete_jobs_object_key_key" ON "storage_delete_jobs"("object_key");

-- CreateIndex
CREATE INDEX "storage_delete_jobs_next_attempt_at_idx" ON "storage_delete_jobs"("next_attempt_at");

-- CreateIndex
CREATE INDEX "rate_buckets_expires_at_idx" ON "rate_buckets"("expires_at");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diaries" ADD CONSTRAINT "diaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diaries" ADD CONSTRAINT "diaries_mood_id_fkey" FOREIGN KEY ("mood_id") REFERENCES "moods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_tags" ADD CONSTRAINT "diary_tags_diary_id_user_id_fkey" FOREIGN KEY ("diary_id", "user_id") REFERENCES "diaries"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_tags" ADD CONSTRAINT "diary_tags_tag_id_user_id_fkey" FOREIGN KEY ("tag_id", "user_id") REFERENCES "tags"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_images" ADD CONSTRAINT "diary_images_diary_id_user_id_fkey" FOREIGN KEY ("diary_id", "user_id") REFERENCES "diaries"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_upload_intents" ADD CONSTRAINT "image_upload_intents_diary_id_user_id_fkey" FOREIGN KEY ("diary_id", "user_id") REFERENCES "diaries"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ownership is enforced by composite foreign keys above; these checks protect physical limits.
CREATE INDEX idx_diaries_active_user_date ON diaries(user_id, diary_date DESC) WHERE deleted_at IS NULL;
ALTER TABLE moods ADD CONSTRAINT moods_score_range CHECK (score BETWEEN 1 AND 5);
ALTER TABLE diary_images ADD CONSTRAINT diary_images_size_range CHECK (size_bytes BETWEEN 1 AND 10000000);
ALTER TABLE diary_images ADD CONSTRAINT diary_images_order_range CHECK (sort_order BETWEEN 0 AND 9);
ALTER TABLE diary_images ADD CONSTRAINT diary_images_mime CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'));
ALTER TABLE user_settings ADD CONSTRAINT user_settings_theme CHECK (theme IN ('LIGHT', 'DARK', 'SYSTEM'));
ALTER TABLE image_upload_intents ADD CONSTRAINT image_upload_intents_status CHECK (status IN ('PENDING', 'COMPLETED', 'ABANDONED'));
