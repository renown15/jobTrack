import logging
import os
from typing import Any

import requests

logger = logging.getLogger(__name__)

# Environment config
AI_PROVIDER = os.environ.get("JOBTRACK_AI_PROVIDER", "ollama")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "mistral")


class EmbeddingProvider:
    def embed(self, texts):
        raise NotImplementedError()


class LLMProvider:
    def generate(self, prompt: str, **kwargs) -> str:
        raise NotImplementedError()


class OllamaProvider(EmbeddingProvider, LLMProvider):
    """Simple Ollama-backed provider that uses the local Ollama HTTP API.

    Note: Ollama can provide model responses; embeddings may be provided by a
    separate service. This example uses a /embed-like convention if available.
    """

    def __init__(self, base_url: str = OLLAMA_URL, model: str = OLLAMA_MODEL):
        self.base_url = base_url.rstrip("/")
        self.model = model

    def embed(self, texts):
        # Ollama does not expose a standard embedding endpoint by default; if
        # you run a model that supports embeddings via HTTP, adapt this call.
        # Here we attempt a best-effort call to an assumed /embeddings endpoint.
        try:
            url = f"{self.base_url}/embeddings"
            resp = requests.post(
                url, json={"model": self.model, "input": texts}, timeout=30
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.exception("Ollama embed failed: %s", e)
            raise

    def generate(self, prompt: str, **kwargs) -> str:
        try:
            url = (
                f"{self.base_url}/api/generate"
                if self.base_url.endswith("/api")
                else f"{self.base_url}/api/generate"
            )
            # Ollama's local API accepts {model, prompt}
            payload = {"model": self.model, "prompt": prompt}
            resp = requests.post(url, json=payload, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            # Ollama response shape may vary; attempt to extract text
            if isinstance(data, dict) and "text" in data:
                return data["text"]
            # fallback: stringify entire response
            return str(data)
        except Exception as e:
            logger.exception("Ollama generate failed: %s", e)
            raise


# Factory
def get_provider() -> Any:
    provider = AI_PROVIDER.lower()
    if provider == "ollama":
        return OllamaProvider()
    # Future providers could be added here (openai, cohere, etc.)
    raise RuntimeError(f"Unknown AI_PROVIDER: {AI_PROVIDER}")
