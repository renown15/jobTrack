-- Migration: 010_add_llmprompts_and_emeddings.sql
-- Navigator: create separate database and tables for Navigator AI component
-- NOTE: This migration attempts to create the dedicated database and tables.
-- Depending on your migration runner and DB privileges you may need to run
-- the `CREATE DATABASE` step as a superuser and then run the CREATE TABLE
-- statements connected to the `jobtrack_navigator_ai` database.

-- Create the navigator database if it does not exist (best-effort).
DO $$
BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'jobtrack_navigator_ai') THEN
       -- Attempt to create the database. In some environments this requires superuser privileges.
       PERFORM (CASE WHEN EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='dblink') THEN 1 ELSE 0 END);
       BEGIN
           EXECUTE 'CREATE DATABASE jobtrack_navigator_ai';
       EXCEPTION WHEN duplicate_database THEN
           -- already exists: ignore
       END;
   END IF;
EXCEPTION
   WHEN OTHERS THEN
       -- ignore: DB creation can be performed manually if needed
       RAISE NOTICE 'Could not create database jobtrack_navigator_ai automatically: %', SQLERRM;
END
$$ LANGUAGE plpgsql;

create DATABASE jobtrack_navigator_ai;

commit

-- The following statements should be executed connected to the `jobtrack_navigator_ai` database.
-- If your migration runner connects only to the main application DB, run the statements below
-- manually against the `jobtrack_navigator_ai` database.

-- Enable pgvector extension in the navigator database (if available)
CREATE EXTENSION IF NOT EXISTS vector;

select version()


-- Table to hold reusable LLM prompts (templated). Column names use no underscores
-- except for `created_at` and `updated_at` which follow app conventions.
CREATE TABLE IF NOT EXISTS public.llmprompts (
    promptid SERIAL PRIMARY KEY,
    promptname TEXT NOT NULL UNIQUE,
    promptvalue TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table to hold embedding vectors and document metadata. Table name 'emeddings' per request
CREATE TABLE IF NOT EXISTS public.emeddings (
    emeddingid SERIAL PRIMARY KEY,
    applicantid INTEGER NOT NULL,
    docid TEXT,
    content TEXT,
    metadata JSONB,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index to support similarity search on embedding (ivfflat requires pgvector)
CREATE INDEX IF NOT EXISTS emeddings_embedding_idx ON public.emeddings USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);

-- Helpful view: prompts
CREATE VIEW IF NOT EXISTS public.llmprompts_view AS
SELECT promptid, promptname, promptvalue, created_at, updated_at FROM public.llmprompts;

-- Migration complete

 Count rows for applicant in main table
SELECT count(*) FROM public.emeddings WHERE applicantid = 1

# Inspect sample rows
SELECT docid, left(content, 500) AS preview, metadata, embedding::text as emb_text FROM public.emeddings WHERE applicantid = 1 LIMIT 5;

# If you expect 1024-dim embeddings, check the other table
SELECT count(*) FROM public.embedding_1024 WHERE applicantid = 1;
SELECT *  FROM public.embedding_1024 WHERE applicantid = 1 LIMIT 5;

delete from embedding_1024 where applicantid = 1 and docid = '20251128135438_Mark_Lewis_CV_-_October_2025.pdf'