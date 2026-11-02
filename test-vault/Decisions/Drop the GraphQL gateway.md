---
tags: [architecture, api]
---

# Drop the GraphQL gateway

The gateway added a hop without reducing client round trips, so we removed it in
March. Clients now call the REST endpoints directly.
