---
tags: [meeting, incident]
---

# Incident review, 4 March 2026

The outage lasted forty minutes and was caused by connection pool exhaustion after
a migration held a lock. Two actions followed: a pool size alert and a migration
lock timeout.
