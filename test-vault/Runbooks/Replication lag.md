---
tags: [runbook, database]
---

# Runbook: replication lag

1. Check the publisher's write volume.
2. Check for long-running queries on the subscriber.
3. If lag exceeds sixty seconds, route reads to the primary.
