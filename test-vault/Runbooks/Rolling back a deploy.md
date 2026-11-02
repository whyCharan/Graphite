---
tags: [runbook, process]
---

# Runbook: rolling back a deploy

Roll forward where possible. A true rollback requires checking whether the deploy
included a migration, because migrations are not reversed automatically.
