---
aliases: [ADR-001, Postgres decision]
tags: [architecture, database]
---

# Use Postgres for the write model

## Context
Parcel events arrive in bursts and must never be lost.

## Decision
We chose Postgres for the write model because transactional guarantees matter
more than write throughput at our volume. Logical replication feeds the read model.

## Consequences
We accept a single-writer bottleneck until sharding becomes necessary.
See [[Read model on Elasticsearch]].
