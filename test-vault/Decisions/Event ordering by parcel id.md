---
tags: [architecture, events]
---

# Event ordering by parcel id

Events are partitioned by parcel id, which guarantees ordering per parcel without
requiring a global sequence.
