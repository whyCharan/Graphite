---
tags: [api, correctness]
---

# Idempotency keys

Clients supply an idempotency key on every write. Keys are kept for twenty-four
hours, after which the same key is treated as a new request.
