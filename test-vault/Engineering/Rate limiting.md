---
tags: [api, reliability]
---

# Rate limiting

Public endpoints allow sixty requests per minute per API key. The limiter uses a
sliding window in Redis. Exceeding it returns 429 with a Retry-After header.
