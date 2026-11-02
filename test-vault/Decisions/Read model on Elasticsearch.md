---
aliases: [ADR-002]
tags: [architecture, search]
---

# Read model on Elasticsearch

Tracking lookups are read-heavy and tolerate a second of staleness, so the read
model lives in Elasticsearch. Replication lag is monitored and alerts at ten seconds.
