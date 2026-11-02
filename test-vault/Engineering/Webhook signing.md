---
aliases: [HMAC webhooks]
tags: [security, api]
---

# Webhook signing

Every webhook carries an HMAC SHA-256 signature in the Harbour-Signature header.
Receivers must compare it in constant time.

```bash
# This hash is a shell comment, not a heading
echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET"
```

Secrets rotate every ninety days.
