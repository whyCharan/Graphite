---
tags: [runbook, database]
---

# Runbook: pool exhaustion

Symptoms are timeouts on every endpoint at once. Raise the PgBouncer pool, then find
the query holding connections. See [[Connection pooling]].
