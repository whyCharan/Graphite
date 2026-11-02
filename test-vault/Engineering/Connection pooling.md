---
tags: [database, performance]
---

# Connection pooling

PgBouncer runs in transaction mode with a pool size of twenty per service.
Prepared statements are disabled because transaction mode does not support them.
