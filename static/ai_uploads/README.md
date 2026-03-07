JobTrack AI Uploads

This directory stores uploaded CVs and other AI-related files.

- Stored under `static/ai_uploads/<applicantid>/` with filenames prefixed by a timestamp.
- Only PDF uploads are accepted by the API endpoint `/api/<applicantid>/ai/upload_cv`.

Configuration

- The application currently expects a local Ollama instance running for embedding and LLM generation. Configure via environment variables:
  - `JOBTRACK_AI_PROVIDER` (default `ollama`)
  - `OLLAMA_URL` (default `http://localhost:11434`)
  - `OLLAMA_MODEL` (model name to use)

Notes

- The embedding / vector ingestion pipeline is a placeholder; after uploading a CV the server stores the file and returns metadata. A separate background worker should process the file, extract text, compute embeddings, and populate `public.ai_vectors`.
- The `database/migrations/010_add_aiprompts_and_ai_vectors.sql` migration creates the `aiprompts` and `ai_vectors` tables and attempts to enable the `vector` extension.
