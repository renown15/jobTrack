-- Migration: 064_create_embedding_1024_table.sql
-- Create a dedicated embeddings table using 1024-dimensional pgvector vectors
-- This table is separate from the original `emeddings` table and is intended
-- for providers that return 1024-dimension vectors.
 -- NOTE: Requires the pgvector extension to be installed in the target database.
-- Run this migration against the `jobtrack_navigator_ai` database (or the DB
-- where you want to store these vectors).

CREATE TABLE IF NOT EXISTS public.embedding_1024 (embeddingid SERIAL PRIMARY KEY,
                                                                     applicantid INTEGER NOT NULL,
                                                                                         docid TEXT, content TEXT, metadata JSONB,
                                                                                                                            embedding vector(1024),
                                                                                                                                      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                                                                                                                                                                                  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now());

-- Create ivfflat index for efficient similarity search. Requires pgvector.

CREATE INDEX IF NOT EXISTS embedding_1024_embedding_idx ON public.embedding_1024 USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);

-- Migration complete
