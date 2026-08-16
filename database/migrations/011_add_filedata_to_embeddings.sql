-- Migration: add file_data column to AI embeddings tables
-- Adds a bytea column to store uploaded document binaries for navigator AI

BEGIN;

ALTER TABLE IF EXISTS public.emeddings
    ADD COLUMN IF NOT EXISTS file_data bytea;

ALTER TABLE IF EXISTS public.embedding_1024
    ADD COLUMN IF NOT EXISTS file_data bytea;

COMMIT;
