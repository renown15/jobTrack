import json
import logging
import os
from functools import lru_cache

import requests
from typing import Any

# module logger must be available before optional imports that may log
logger = logging.getLogger(__name__)

# Optional tokenizer support via Hugging Face transformers AutoTokenizer
_TRANSFORMERS_AVAILABLE = False
_AUTO_TOKENIZER = None
try:
    from transformers import AutoTokenizer  # type: ignore

    _TRANSFORMERS_AVAILABLE = True
except Exception as e:
    # Transformers not available — log at debug level for diagnostics in CI/test runs
    logger.debug("transformers AutoTokenizer import failed: %s", e)
    AutoTokenizer = None  # type: ignore
    _TRANSFORMERS_AVAILABLE = False


def _extract_json_objects_from_text(text: str):
    """Extract top-level JSON object substrings from a text blob by counting braces.
    Returns a list of JSON string slices (each starting with '{' and ending with matching '}').
    """
    objs = []
    start = None
    depth = 0
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start is not None:
                    objs.append(text[start : i + 1])
                    start = None
        i += 1
    return objs


def _assemble_response_tokens_from_text(text: str) -> str:
    """Scan a text blob for JSON objects and return an assembled string
    comprised only of the `response` token values found. This handles
    concatenated JSON objects, NDJSON lines, and plain streaming dumps.
    If no `response` tokens are found, returns empty string.
    """
    if not text:
        return ""
    pieces = []
    try:
        # First, try to extract brace-delimited JSON objects
        subs = _extract_json_objects_from_text(text)
        for s in subs:
            try:
                obj = json.loads(s)
            except Exception:
                continue
            if (
                isinstance(obj, dict)
                and "response" in obj
                and isinstance(obj["response"], str)
            ):
                pieces.append(obj["response"])
    except Exception as e:
        # fallthrough to line-based parsing below; log debug info
        logger.debug("Failed extracting brace-delimited JSON objects: %s", e)

    if not pieces:
        # Fallback: try parsing each line as JSON (NDJSON-style)
        for line in (text or "").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            if (
                isinstance(obj, dict)
                and "response" in obj
                and isinstance(obj["response"], str)
            ):
                pieces.append(obj["response"])

    if not pieces:
        return ""

    # Assemble tokens with punctuation-aware spacing
    assembled = ""
    punct = set(",.!?:;)%]")
    for tok in pieces:
        if not isinstance(tok, str):
            tok = str(tok)
        tok = tok.strip()
        if tok == "":
            continue
        if assembled == "":
            assembled = tok
        else:
            if tok[0] in punct:
                assembled += tok
            else:
                assembled += " " + tok
    return assembled


# Environment config
AI_PROVIDER = os.environ.get("JOBTRACK_AI_PROVIDER", "ollama")
# Keep a simple default but resolve the best reachable host lazily in `get_provider()`.
# Default environment override is still respected via `OLLAMA_URL`.
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")


def diagnose_ollama_resolution(timeout: float = 1.0) -> dict:
    """Diagnostic helper to check name resolution and basic reachability for the configured OLLAMA_URL.

    Returns a dict with keys: `url`, `host`, `resolved` (bool), `addresses` (list),
    and `http_probe` (True if `/api/models` returned 2xx/3xx within timeout). This helper does not
    raise; it returns diagnostic information suitable for logging or returning to a user.
    """
    import socket
    from urllib.parse import urlparse

    parsed = urlparse(OLLAMA_URL)
    host = parsed.hostname or ""
    port = parsed.port
    result = {
        "url": OLLAMA_URL,
        "host": host,
        "port": port,
        "resolved": False,
        "addresses": [],
        "http_probe": False,
        "error": None,
    }
    if not host:
        result["error"] = "No hostname parsed from OLLAMA_URL"
        return result
    try:
        infos = socket.getaddrinfo(host, port or 0, proto=socket.IPPROTO_TCP)
        addrs = []
        for fam, socktype, proto, cname, sockaddr in infos:
            addrs.append(sockaddr[0])
        result["resolved"] = bool(addrs)
        result["addresses"] = list(dict.fromkeys(addrs))
    except Exception as e:
        result["error"] = f"name resolution failed: {e}"
        # Do not return yet; we'll attempt a short HTTP probe which may reveal NAT/host mapping issues
    # lightweight HTTP probe
    try:
        probe_url = OLLAMA_URL.rstrip("/") + "/api/models"
        resp = requests.get(probe_url, timeout=timeout)
        result["http_probe"] = 200 <= resp.status_code < 400
    except Exception as e:
        # attach exception string for diagnostics
        prev = result.get("error")
        result["error"] = (prev + "; " if prev else "") + f"http probe failed: {e}"
    return result


# Model selection: separate models for embedding and generation
OLLAMA_EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "mxbai-embed-large")
OLLAMA_GEN_MODEL = os.environ.get("OLLAMA_GEN_MODEL", "gemma3")


class EmbeddingProvider:
    def embed(self, texts):
        raise NotImplementedError()


class LLMProvider:
    def generate(self, prompt: str, **kwargs) -> Any:
        raise NotImplementedError()


class OllamaProvider(EmbeddingProvider, LLMProvider):
    """Simple Ollama-backed provider that uses the local Ollama HTTP API.

    Note: Ollama can provide model responses; embeddings may be provided by a
    separate service. This example uses a /embeddings endpoint if available.
    """

    def __init__(
        self,
        base_url: str = OLLAMA_URL,
        embed_model: str = OLLAMA_EMBED_MODEL,
        gen_model: str = OLLAMA_GEN_MODEL,
    ):
        self.base_url = base_url.rstrip("/")
        self.embed_model = embed_model
        self.gen_model = gen_model

    def embed(self, texts):
        import time

        url = f"{self.base_url}/api/embed"
        payload = {"model": self.embed_model, "input": texts}
        start = time.time()
        # Log a concise diagnostic: number of inputs and a short preview
        try:
            preview = (
                (texts[0][:200] + "...")
                if isinstance(texts, (list, tuple))
                and texts
                and isinstance(texts[0], str)
                else None
            )
        except Exception:
            preview = None
        logger.debug(
            "Ollama.embed request: url=%s model=%s inputs=%d preview=%s",
            url,
            self.embed_model,
            len(texts) if hasattr(texts, "__len__") else 0,
            preview,
        )
        try:
            resp = requests.post(url, json=payload, timeout=30)
            elapsed = time.time() - start
            # Log status and truncated response body for debugging (avoid huge dumps)
            status = getattr(resp, "status_code", None)
            try:
                text = resp.text
                text_preview = text[:1000] + ("..." if len(text) > 1000 else "")
            except Exception:
                text_preview = "<could not read body>"
            logger.debug(
                "Ollama.embed response: status=%s elapsed=%.3fs body_preview=%s",
                status,
                elapsed,
                text_preview,
            )
            resp.raise_for_status()
            try:
                return resp.json()
            except Exception:
                # If JSON decoding fails, raise with body included in log
                logger.exception("Failed to parse JSON from Ollama embed response")
                raise
        except Exception as e:
            logger.exception("Ollama embed failed: %s", e)
            raise

    def generate(self, prompt: str, **kwargs) -> Any:
        import time

        url = f"{self.base_url}/api/generate"
        # Respect client preference to avoid streaming. If caller passes stream=False,
        # we'll treat any chunked response as non-streaming and accumulate the full body.
        prefer_no_stream = False
        if "stream" in kwargs:
            try:
                if kwargs.get("stream") is False:
                    prefer_no_stream = True
            except Exception as e:
                logger.debug("Ignored preference parse error (stream): %s", e)
        # Allow callers to request token counts in the returned value
        return_token_counts = bool(kwargs.pop("return_token_counts", False))

        # Count input tokens once (server-side AutoTokenizer when available)
        try:
            input_token_count = _count_tokens_hf(prompt, self.gen_model)
        except Exception:
            input_token_count = max(1, len(prompt) // 4 if prompt else 0)

        def _return_with_counts(text_response: str):
            try:
                output_token_count = _count_tokens_hf(text_response, self.gen_model)
            except Exception:
                output_token_count = max(
                    1, len(text_response) // 4 if text_response else 0
                )
            logger.debug(
                "Ollama.generate tokens: input=%d output=%d model=%s",
                input_token_count,
                output_token_count,
                self.gen_model,
            )
            if return_token_counts:
                return {
                    "text": text_response,
                    "token_counts": {
                        "input": input_token_count,
                        "output": output_token_count,
                    },
                }
            return text_response

        # Try a few payload shapes to be tolerant of different provider APIs
        from typing import Any as _Any
        from typing import Dict

        candidate_payloads: list[Dict[str, _Any]] = [
            {"model": self.gen_model, "prompt": prompt},
            {"model": self.gen_model, "input": prompt},
            {
                "model": self.gen_model,
                "messages": [{"role": "user", "content": prompt}],
            },
            {"model": self.gen_model, "text": prompt},
        ]
        last_resp = None
        for payload in candidate_payloads:
            start = time.time()
            try:
                preview = (
                    (prompt[:200] + "...")
                    if isinstance(prompt, str) and len(prompt) > 200
                    else prompt
                )
            except Exception:
                preview = None
            try:
                payload_keys = (
                    list(payload.keys())
                    if hasattr(payload, "keys")
                    else str(type(payload))
                )
            except Exception as e:
                logger.debug("Failed to determine payload_keys: %s", e)
                payload_keys = str(type(payload))
            # If caller asked for non-streaming, include the hint in the payload if supported
            if prefer_no_stream:
                try:
                    # Some providers accept a top-level 'stream' boolean to disable streaming
                    payload["stream"] = False
                except Exception as e:
                    logger.debug("Could not set payload['stream']=False: %s", e)
            logger.debug(
                "Ollama.generate attempt: url=%s payload_keys=%s preview=%s",
                url,
                payload_keys,
                preview,
            )
            try:
                resp = requests.post(url, json=payload, timeout=60)
                elapsed = time.time() - start
                status = getattr(resp, "status_code", None)
                try:
                    text = resp.text
                    text_preview = text[:1000] + ("..." if len(text) > 1000 else "")
                except Exception:
                    text_preview = "<could not read body>"
                logger.debug(
                    "Ollama.generate response: status=%s elapsed=%.3fs body_preview=%s",
                    status,
                    elapsed,
                    text_preview,
                )
                last_resp = resp
                if resp.status_code >= 400:
                    # try next payload shape
                    logger.debug(
                        "Ollama.generate attempt returned status %s; trying next payload shape",
                        resp.status_code,
                    )
                    continue
                # success — detect streaming (SSE / chunked) and handle accordingly
                ct = (resp.headers.get("Content-Type") or "").lower()
                is_stream = (
                    "text/event-stream" in ct
                    or "stream" in ct
                    or resp.headers.get("Transfer-Encoding", "").lower() == "chunked"
                ) and not prefer_no_stream
                if is_stream:
                    # Consume streaming response: collect pieces and assemble
                    pieces = []
                    try:
                        done_flag = False
                        for raw_line in resp.iter_lines(decode_unicode=True):
                            if not raw_line:
                                continue
                            line = raw_line.strip()
                            # SSE style: lines like 'data: {...}' or plain chunks
                            if line.startswith("data:"):
                                payload = line[len("data:") :].strip()
                            else:
                                payload = line
                            if payload == "[DONE]":
                                break
                            # Try to parse JSON payloads first
                            # Ensure payload is a string for json.loads; log and raise on parse errors
                            # Normalize to string
                            if isinstance(payload, (bytes, bytearray)):
                                payload_str = payload.decode("utf-8", errors="replace")
                            elif isinstance(payload, str):
                                payload_str = payload
                            else:
                                payload_str = str(payload)

                            # First try to parse as a single JSON object
                            parsed_any = False
                            try:
                                obj = json.loads(payload_str)
                                parsed_any = True
                                objs = [obj]
                            except json.JSONDecodeError:
                                # Attempt to extract concatenated JSON object substrings
                                objs = []
                                try:
                                    subs = _extract_json_objects_from_text(payload_str)
                                    for s in subs:
                                        try:
                                            objs.append(json.loads(s))
                                        except Exception:
                                            # skip unparsable substring
                                            continue
                                    if objs:
                                        parsed_any = True
                                except Exception:
                                    parsed_any = False

                            if not parsed_any:
                                # Could not parse any JSON from payload — skip raw JSON blobs
                                # Appending raw JSON caused the UI to show JSON fragments.
                                logger.debug(
                                    "Ollama.generate: could not parse payload, skipping raw chunk: %s",
                                    payload_str[:200],
                                )
                                continue
                            # parsed some JSON objects — collect only 'response' tokens
                            for obj in objs:
                                if (
                                    isinstance(obj, dict)
                                    and "response" in obj
                                    and isinstance(obj["response"], str)
                                ):
                                    pieces.append(obj["response"])
                                # Respect provider done flag: stop early if signalled
                                if isinstance(obj, dict) and obj.get("done") is True:
                                    done_flag = True
                                    break
                            if done_flag:
                                break
                        # Assemble tokens preferring 'response' fields only and return
                        assembled = ""
                        punct = set(",.!?:;)%]")
                        for tok in pieces:
                            if not isinstance(tok, str):
                                tok = str(tok)
                            tok = tok.strip()
                            if tok == "":
                                continue
                            if assembled == "":
                                assembled = tok
                            else:
                                if tok[0] in punct:
                                    assembled += tok
                                else:
                                    assembled += " " + tok
                        return _return_with_counts(assembled)
                    except Exception:
                        # Fall back: try to assemble response tokens from full body text
                        try:
                            assembled = _assemble_response_tokens_from_text(
                                getattr(resp, "text", "") or ""
                            )
                            if assembled:
                                return assembled
                        except Exception:
                            logger.debug(
                                "Failed to assemble response from streaming fallback"
                            )
                        # If nothing could be assembled, return empty string to avoid raw JSON fragments
                        return ""
                # If caller preferred no streaming but the response used chunked transfer,
                # accumulate the full body and continue with non-streaming processing below.
                if prefer_no_stream and (
                    "chunked" in (resp.headers.get("Transfer-Encoding") or "").lower()
                ):
                    try:
                        parts: list[str] = []
                        for chunk in resp.iter_content(
                            chunk_size=4096, decode_unicode=True
                        ):
                            if chunk:
                                parts.append(chunk)
                        text_body: str | None = "".join(parts)
                    except Exception:
                        text_body = getattr(resp, "text", None)
                    # proceed to non-streaming handling using text_body
                    # (the code below will re-read resp.text if text_body not used)
                    # assign to local variable for downstream use
                    _forced_text_body = text_body
                # Non-streaming: handle a few cases
                # 1) NDJSON / newline-delimited JSON (multiple JSON objects concatenated with newlines)
                # 2) Single JSON object
                # 3) Fallback: return raw text
                # Ensure `text_body` is typed consistently for subsequent processing
                try:
                    forced = locals().get("_forced_text_body")
                    text_body = (
                        forced
                        if forced is not None
                        else (
                            resp.text
                            if getattr(resp, "text", None) is not None
                            else None
                        )
                    )
                except Exception:
                    text_body = None

                if text_body and text_body.strip().startswith("{"):
                    # Try to extract JSON objects from the body and parse them
                    pieces = []
                    subs = _extract_json_objects_from_text(text_body)
                    if subs:
                        for s in subs:
                            try:
                                obj = json.loads(s)
                            except Exception:
                                # skip unparsable substring rather than returning raw JSON
                                logger.debug(
                                    "Ollama.generate: skipped unparsable substring in non-streaming body: %s",
                                    s[:200],
                                )
                                continue
                            if (
                                isinstance(obj, dict)
                                and "response" in obj
                                and isinstance(obj["response"], str)
                            ):
                                pieces.append(obj["response"])
                            # If provider signals completion, we will assemble and return below
                        # Assemble tokens preferring 'response' fields only and return
                        assembled = ""
                        punct = set(",.!?:;)%]")
                        for tok in pieces:
                            if not isinstance(tok, str):
                                tok = str(tok)
                            tok = tok.strip()
                            if tok == "":
                                continue
                            if assembled == "":
                                assembled = tok
                            else:
                                if tok[0] in punct:
                                    assembled += tok
                                else:
                                    assembled += " " + tok
                        return _return_with_counts(assembled)
                # Try parsing as a single JSON object
                try:
                    data = resp.json()
                except Exception:
                    # If response isn't JSON, attempt to assemble response tokens
                    assembled = _assemble_response_tokens_from_text(text_body or "")
                    if assembled:
                        return _return_with_counts(assembled)
                    return text_body or ""

                if isinstance(data, dict):
                    # prefer common fields
                    for key in ("response", "text", "content", "result"):
                        if key in data and isinstance(data[key], str):
                            return _return_with_counts(data[key])
                    # sometimes 'choices' or similar
                    if (
                        "choices" in data
                        and isinstance(data["choices"], list)
                        and len(data["choices"]) > 0
                    ):
                        first = data["choices"][0]
                        if isinstance(first, dict) and "text" in first:
                            return _return_with_counts(first["text"])
                # As a final attempt, try to assemble response tokens from the raw text body
                assembled = _assemble_response_tokens_from_text(text_body or "")
                if assembled:
                    return _return_with_counts(assembled)
                return _return_with_counts(str(data))
            except requests.exceptions.RequestException as e:
                logger.exception("Ollama generate request failed: %s", e)
                last_resp = getattr(e, "response", None) or last_resp
                continue

        # If we reach here, all attempts failed. Raise with last response body if available.
        if last_resp is not None:
            try:
                body = last_resp.text
            except Exception:
                body = "<could not read body>"
            status = getattr(last_resp, "status_code", "unknown")
            logger.error(
                "Ollama.generate failed after attempts: status=%s body_preview=%s",
                status,
                (body[:1000] + ("..." if len(body) > 1000 else "")),
            )
            # raise an HTTPError with response attached so callers can inspect
            last_resp.raise_for_status()
        raise RuntimeError(
            "Ollama generate failed: no successful response from provider"
        )


def _count_tokens_hf(text: str, model_name: str | None = None) -> int:
    """Count tokens using Hugging Face AutoTokenizer when available.
    Falls back to a conservative heuristic (chars/4) if transformers not installed
    or tokenizer cannot be loaded for the given model.
    """
    if not text:
        return 0
    if not _TRANSFORMERS_AVAILABLE:
        # rough heuristic: ~4 chars per token
        return max(1, len(text) // 4)

    # Try to cache tokenizers per-model name to avoid repeated downloads/loads
    key = model_name or "default"
    try:
        tokenizer = _get_tokenizer_for_model(key)
        # use encode without adding special tokens to get a straightforward token count
        toks = tokenizer.encode(text, add_special_tokens=False)
        return len(toks)
    except Exception:
        return max(1, len(text) // 4)


@lru_cache(maxsize=8)
def _get_tokenizer_for_model(model_name: str):
    # If transformers/AutoTokenizer is not available, raise so callers can fallback
    if not _TRANSFORMERS_AVAILABLE or AutoTokenizer is None:
        raise RuntimeError("transformers AutoTokenizer is not available")

    # Prefer a direct model name if provided; if that fails, fall back to 'gpt2' encoding
    try:
        if model_name and model_name != "default":
            return AutoTokenizer.from_pretrained(model_name, use_fast=True)
    except Exception:
        logger.debug(
            "AutoTokenizer.from_pretrained(%s) failed, falling back to gpt2", model_name
        )
    # Fallback
    try:
        return AutoTokenizer.from_pretrained("gpt2", use_fast=True)
    except Exception:
        # If even this fails, raise to be caught by caller
        raise

    def embed(self, texts):
        import time

        url = f"{self.base_url}/api/embed"
        payload = {"model": self.embed_model, "input": texts}
        start = time.time()
        # Log a concise diagnostic: number of inputs and a short preview
        try:
            preview = (
                (texts[0][:200] + "...")
                if isinstance(texts, (list, tuple))
                and texts
                and isinstance(texts[0], str)
                else None
            )
        except Exception:
            preview = None
        logger.debug(
            "Ollama.embed request: url=%s model=%s inputs=%d preview=%s",
            url,
            self.embed_model,
            len(texts) if hasattr(texts, "__len__") else 0,
            preview,
        )
        try:
            resp = requests.post(url, json=payload, timeout=30)
            elapsed = time.time() - start
            # Log status and truncated response body for debugging (avoid huge dumps)
            status = getattr(resp, "status_code", None)
            try:
                text = resp.text
                text_preview = text[:1000] + ("..." if len(text) > 1000 else "")
            except Exception:
                text_preview = "<could not read body>"
            logger.debug(
                "Ollama.embed response: status=%s elapsed=%.3fs body_preview=%s",
                status,
                elapsed,
                text_preview,
            )
            resp.raise_for_status()
            try:
                return resp.json()
            except Exception:
                # If JSON decoding fails, raise with body included in log
                logger.exception("Failed to parse JSON from Ollama embed response")
                raise
        except Exception as e:
            logger.exception("Ollama embed failed: %s", e)
            raise

    def generate(self, prompt: str, **kwargs) -> Any:
        import time

        url = f"{self.base_url}/api/generate"
        # Respect client preference to avoid streaming. If caller passes stream=False,
        # we'll treat any chunked response as non-streaming and accumulate the full body.
        prefer_no_stream = False
        if "stream" in kwargs:
            try:
                if kwargs.get("stream") is False:
                    prefer_no_stream = True
            except Exception as e:
                logger.debug(
                    "Ignored preference parse error (stream) in provider.generate: %s",
                    e,
                )
        # Allow callers to request token counts in the returned value
        return_token_counts = bool(kwargs.pop("return_token_counts", False))

        # Count input tokens once (server-side AutoTokenizer when available)
        try:
            input_token_count = _count_tokens_hf(prompt, self.gen_model)
        except Exception:
            input_token_count = max(1, len(prompt) // 4 if prompt else 0)

        def _return_with_counts(text_response: str):
            try:
                output_token_count = _count_tokens_hf(text_response, self.gen_model)
            except Exception:
                output_token_count = max(
                    1, len(text_response) // 4 if text_response else 0
                )
            logger.debug(
                "Ollama.generate tokens: input=%d output=%d model=%s",
                input_token_count,
                output_token_count,
                self.gen_model,
            )
            if return_token_counts:
                return {
                    "text": text_response,
                    "token_counts": {
                        "input": input_token_count,
                        "output": output_token_count,
                    },
                }
            return text_response

        # Try a few payload shapes to be tolerant of different provider APIs
        candidate_payloads = [
            {"model": self.gen_model, "prompt": prompt},
            {"model": self.gen_model, "input": prompt},
            {
                "model": self.gen_model,
                "messages": [{"role": "user", "content": prompt}],
            },
            {"model": self.gen_model, "text": prompt},
        ]
        last_resp = None
        for payload in candidate_payloads:
            start = time.time()
            try:
                preview = (
                    (prompt[:200] + "...")
                    if isinstance(prompt, str) and len(prompt) > 200
                    else prompt
                )
            except Exception:
                preview = None
            try:
                payload_keys = (
                    list(payload.keys())
                    if hasattr(payload, "keys")
                    else str(type(payload))
                )
            except Exception as e:
                logger.debug("Failed to determine payload_keys: %s", e)
                payload_keys = str(type(payload))
            # If caller asked for non-streaming, include the hint in the payload if supported
            if prefer_no_stream:
                try:
                    # Some providers accept a top-level 'stream' boolean to disable streaming
                    payload["stream"] = False
                except Exception as e:
                    logger.debug("Ignored payload stream hint failure: %s", e)
            logger.debug(
                "Ollama.generate attempt: url=%s payload_keys=%s preview=%s",
                url,
                payload_keys,
                preview,
            )
            try:
                resp = requests.post(url, json=payload, timeout=60)
                elapsed = time.time() - start
                status = getattr(resp, "status_code", None)
                try:
                    text = resp.text
                    text_preview = text[:1000] + ("..." if len(text) > 1000 else "")
                except Exception:
                    text_preview = "<could not read body>"
                logger.debug(
                    "Ollama.generate response: status=%s elapsed=%.3fs body_preview=%s",
                    status,
                    elapsed,
                    text_preview,
                )
                last_resp = resp
                if resp.status_code >= 400:
                    # try next payload shape
                    logger.debug(
                        "Ollama.generate attempt returned status %s; trying next payload shape",
                        resp.status_code,
                    )
                    continue
                # success — detect streaming (SSE / chunked) and handle accordingly
                ct = (resp.headers.get("Content-Type") or "").lower()
                is_stream = (
                    "text/event-stream" in ct
                    or "stream" in ct
                    or resp.headers.get("Transfer-Encoding", "").lower() == "chunked"
                ) and not prefer_no_stream
                if is_stream:
                    # Consume streaming response: collect pieces and assemble
                    pieces = []
                    try:
                        done_flag = False
                        for raw_line in resp.iter_lines(decode_unicode=True):
                            if not raw_line:
                                continue
                            line = raw_line.strip()
                            # SSE style: lines like 'data: {...}' or plain chunks
                            if line.startswith("data:"):
                                payload = line[len("data:") :].strip()
                            else:
                                payload = line
                            if payload == "[DONE]":
                                break
                            # Try to parse JSON payloads first
                            # Ensure payload is a string for json.loads; log and raise on parse errors
                            # Normalize to string
                            if isinstance(payload, (bytes, bytearray)):
                                payload_str = payload.decode("utf-8", errors="replace")
                            elif isinstance(payload, str):
                                payload_str = payload
                            else:
                                payload_str = str(payload)

                            # First try to parse as a single JSON object
                            parsed_any = False
                            try:
                                obj = json.loads(payload_str)
                                parsed_any = True
                                objs = [obj]
                            except json.JSONDecodeError:
                                # Attempt to extract concatenated JSON object substrings
                                objs = []
                                try:
                                    subs = _extract_json_objects_from_text(payload_str)
                                    for s in subs:
                                        try:
                                            objs.append(json.loads(s))
                                        except Exception:
                                            # skip unparsable substring
                                            continue
                                    if objs:
                                        parsed_any = True
                                except Exception:
                                    parsed_any = False

                            if not parsed_any:
                                # Could not parse any JSON from payload — skip raw JSON blobs
                                # Appending raw JSON caused the UI to show JSON fragments.
                                logger.debug(
                                    "Ollama.generate: could not parse payload, skipping raw chunk: %s",
                                    payload_str[:200],
                                )
                                continue
                            # parsed some JSON objects — collect only 'response' tokens
                            for obj in objs:
                                if (
                                    isinstance(obj, dict)
                                    and "response" in obj
                                    and isinstance(obj["response"], str)
                                ):
                                    pieces.append(obj["response"])
                                # Respect provider done flag: stop early if signalled
                                if isinstance(obj, dict) and obj.get("done") is True:
                                    done_flag = True
                                    break
                            if done_flag:
                                break
                        # Assemble tokens preferring 'response' fields only and return
                        assembled = ""
                        punct = set(",.!?:;)%]")
                        for tok in pieces:
                            if not isinstance(tok, str):
                                tok = str(tok)
                            tok = tok.strip()
                            if tok == "":
                                continue
                            if assembled == "":
                                assembled = tok
                            else:
                                if tok[0] in punct:
                                    assembled += tok
                                else:
                                    assembled += " " + tok
                        return _return_with_counts(assembled)
                    except Exception:
                        # Fall back: try to assemble response tokens from full body text
                        try:
                            assembled = _assemble_response_tokens_from_text(
                                getattr(resp, "text", "") or ""
                            )
                            if assembled:
                                return assembled
                        except Exception:
                            logger.debug(
                                "Failed to assemble response from streaming fallback"
                            )
                        # If nothing could be assembled, return empty string to avoid raw JSON fragments
                        return ""
                # If caller preferred no streaming but the response used chunked transfer,
                # accumulate the full body and continue with non-streaming processing below.
                if prefer_no_stream and (
                    "chunked" in (resp.headers.get("Transfer-Encoding") or "").lower()
                ):
                    try:
                        parts = []
                        for chunk in resp.iter_content(
                            chunk_size=4096, decode_unicode=True
                        ):
                            if chunk:
                                parts.append(chunk)
                        text_body = "".join(parts)
                    except Exception:
                        text_body = getattr(resp, "text", None)
                    # proceed to non-streaming handling using text_body
                    # (the code below will re-read resp.text if text_body not used)
                    # assign to local variable for downstream use
                    _forced_text_body = text_body
                # Non-streaming: handle a few cases
                # 1) NDJSON / newline-delimited JSON (multiple JSON objects concatenated with newlines)
                # 2) Single JSON object
                # 3) Fallback: return raw text
                try:
                    text_body = (
                        locals().get("_forced_text_body")
                        if locals().get("_forced_text_body") is not None
                        else resp.text
                    )
                except Exception:
                    text_body = None

                if text_body and text_body.strip().startswith("{"):
                    # Try to extract JSON objects from the body and parse them
                    pieces = []
                    subs = _extract_json_objects_from_text(text_body)
                    if subs:
                        for s in subs:
                            try:
                                obj = json.loads(s)
                            except Exception:
                                # skip unparsable substring rather than returning raw JSON
                                logger.debug(
                                    "Ollama.generate: skipped unparsable substring in non-streaming body: %s",
                                    s[:200],
                                )
                                continue
                            if (
                                isinstance(obj, dict)
                                and "response" in obj
                                and isinstance(obj["response"], str)
                            ):
                                pieces.append(obj["response"])
                            # If provider signals completion, we will assemble and return below
                        # Assemble tokens preferring 'response' fields only and return
                        assembled = ""
                        punct = set(",.!?:;)%]")
                        for tok in pieces:
                            if not isinstance(tok, str):
                                tok = str(tok)
                            tok = tok.strip()
                            if tok == "":
                                continue
                            if assembled == "":
                                assembled = tok
                            else:
                                if tok[0] in punct:
                                    assembled += tok
                                else:
                                    assembled += " " + tok
                        return _return_with_counts(assembled)
                # Try parsing as a single JSON object
                try:
                    data = resp.json()
                except Exception:
                    # If response isn't JSON, attempt to assemble response tokens
                    assembled = _assemble_response_tokens_from_text(text_body or "")
                    if assembled:
                        return _return_with_counts(assembled)
                    return text_body or ""

                if isinstance(data, dict):
                    # prefer common fields
                    for key in ("response", "text", "content", "result"):
                        if key in data and isinstance(data[key], str):
                            return _return_with_counts(data[key])
                    # sometimes 'choices' or similar
                    if (
                        "choices" in data
                        and isinstance(data["choices"], list)
                        and len(data["choices"]) > 0
                    ):
                        first = data["choices"][0]
                        if isinstance(first, dict) and "text" in first:
                            return _return_with_counts(first["text"])
                # As a final attempt, try to assemble response tokens from the raw text body
                assembled = _assemble_response_tokens_from_text(text_body or "")
                if assembled:
                    return _return_with_counts(assembled)
                return _return_with_counts(str(data))
            except requests.exceptions.RequestException as e:
                logger.exception("Ollama generate request failed: %s", e)
                last_resp = getattr(e, "response", None) or last_resp
                continue

        # If we reach here, all attempts failed. Raise with last response body if available.
        if last_resp is not None:
            try:
                body = last_resp.text
            except Exception:
                body = "<could not read body>"
            status = getattr(last_resp, "status_code", "unknown")
            logger.error(
                "Ollama.generate failed after attempts: status=%s body_preview=%s",
                status,
                (body[:1000] + ("..." if len(body) > 1000 else "")),
            )
            # raise an HTTPError with response attached so callers can inspect
            last_resp.raise_for_status()
        raise RuntimeError(
            "Ollama generate failed: no successful response from provider"
        )


# Factory
def get_provider() -> Any:
    provider = AI_PROVIDER.lower()
    if provider == "ollama":
        # DO NOT perform automatic fallbacks. Respect the user's explicit
        # `OLLAMA_URL` (or the default) exactly. If that URL is not reachable
        # the caller will receive an explicit error; use `diagnose_ollama_resolution()`
        # to get more information about name resolution and reachability.
        if "host.docker.internal" in (OLLAMA_URL or ""):
            logger.warning(
                "OLLAMA_URL references host.docker.internal — ensure this hostname is resolvable in your environment: OLLAMA_URL=%s",
                OLLAMA_URL,
            )
        return OllamaProvider(base_url=OLLAMA_URL)
    raise RuntimeError(f"Unknown AI_PROVIDER: {AI_PROVIDER}")


def provider_health(timeout: float = 5.0) -> dict:
    """Return a small dict describing provider availability.

    Example return shapes:
      { 'ok': True }
      { 'ok': False, 'error': 'unreachable', 'message': 'Connection refused' }
    """
    try:
        prov = get_provider()
    except Exception as e:
        logger.exception("provider_health: failed to construct provider: %s", e)
        return {"ok": False, "error": "provider_init_failed", "message": str(e)}

    # Best-effort health probe for known provider types
    try:
        # Ollama: prefer probing the user-facing `/api/generate` first since
        # some local shims expose that but not `/api/models`. Treat 200..399
        # as OK. Additionally treat 405 (Method Not Allowed) from
        # `/api/generate` as reachable (indicates endpoint exists but requires
        # POST).
        if isinstance(prov, OllamaProvider):
            # Perform a lightweight, non-streaming generate call through the
            # provider itself. This mirrors the standard generation path the
            # UI uses and confirms the model is reachable and able to produce
            # a simple response. We prefer `stream=False` so the probe is
            # synchronous and side-effect free.
            try:
                # Prov.generate may return a string or a dict (if token counts
                # were requested). Request a simple hello and treat any
                # non-empty textual response as healthy.
                resp = prov.generate("say hello", stream=False)
                # Normalize response to text
                if isinstance(resp, dict):
                    text = ""
                    if isinstance(resp.get("text"), str):
                        text = resp.get("text")
                    else:
                        # Fallback to stringifying the dict
                        text = json.dumps(resp)
                else:
                    text = str(resp or "")

                if str(text).strip() == "":
                    return {
                        "ok": False,
                        "error": "empty_response",
                        "message": "provider returned empty response",
                    }
                return {"ok": True, "message": "probe ok"}
            except Exception as e:
                # Surface the underlying error so callers can diagnose
                # (network issues, HTTPError, etc.).
                logger.debug("provider_health: generate probe failed: %s", e)
                return {"ok": False, "error": "unreachable", "message": str(e)}

        # Other provider implementations: assume available (optimistic)
        return {"ok": True}
    except Exception as e:
        logger.exception("provider_health: unexpected error: %s", e)
        return {"ok": False, "error": "unexpected", "message": str(e)}
