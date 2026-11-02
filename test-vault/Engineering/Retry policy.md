---
tags: [reliability]
---

# Retry policy

Failed webhook deliveries retry with exponential backoff, starting at two seconds
and giving up after six attempts.
