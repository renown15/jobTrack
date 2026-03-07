Navigator Uploads

This directory stores uploaded CVs and other Navigator-related files.

- Stored under `static/navigator_uploads/<applicantid>/` with filenames prefixed by a timestamp.
- Only PDF uploads are accepted by the API endpoint `/api/<applicantid>/navigator/upload_cv`.

Configuration

- The application currently expects a local Ollama instance or other embedding/LLM provider. Configure via environment variables:
  - `JOBTRACK_AI_PROVIDER` (default `ollama`)
  - `OLLAMA_URL` (default `http://localhost:11434`)
  - `OLLAMA_MODEL` (model name to use)

Notes

- The embedding / vector ingestion pipeline is a placeholder; after uploading a CV the server stores the file and returns metadata. A separate background worker should process the file, extract text, compute embeddings, and populate `public.emeddings` in the `jobtrack_navigator_ai` database.
- The `database/migrations/010_add_aiprompts_and_ai_vectors.sql` migration was updated to create the `jobtrack_navigator_ai` database and the tables `llmprompts` and `emeddings` (run as appropriate for your environment).
