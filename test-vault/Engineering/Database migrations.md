---
tags: [database, process]
---

# Database migrations

Migrations run before deployment, never during. Every migration must be reversible
and must not lock a table for more than one second.
