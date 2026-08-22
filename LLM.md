# Team LLM Guide

Use the local Muse Glimmer 30B model through its OpenAI-compatible API.

## Endpoint

```bash
export LLM_API_BASE="http://10.0.0.167:8000/v1"
export LLM_MODEL="muse-glimmer-30b"
```

The server is on the local network. Its IP can change if DHCP assigns the host
a new address; update this document and your environment variable if that
happens.

## Check availability

```bash
curl -fsS "$LLM_API_BASE/models" | jq
```

If this command succeeds, the API is ready. The model list should include
`muse-glimmer-30b`.

## Send a chat request

```bash
curl -sS "$LLM_API_BASE/chat/completions" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "muse-glimmer-30b",
    "messages": [
      {"role": "system", "content": "Reasoning strength: low"},
      {"role": "user", "content": "Explain this code in three sentences."}
    ],
    "max_tokens": 512,
    "temperature": 1.0,
    "top_p": 0.95,
    "top_k": 64
  }' | jq -r '.choices[0].message.content'
```

Use the published sampling settings above. Do not use greedy decoding for this
reasoning model.

## Use from application code

Point any OpenAI-compatible client at `$LLM_API_BASE` and select
`muse-glimmer-30b`. No API key is required for this LAN endpoint; configure a
placeholder value only when a client library requires one.

## Streaming

Add `"stream": true` to the request body and use `curl -N` to display
server-sent events as they arrive:

```bash
curl -N -sS "$LLM_API_BASE/chat/completions" \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{
    "model": "muse-glimmer-30b",
    "messages": [{"role": "user", "content": "Give a concise project status update."}],
    "max_tokens": 512,
    "temperature": 1.0,
    "top_p": 0.95,
    "top_k": 64,
    "stream": true
  }'
```
