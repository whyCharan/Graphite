/**
 * The test vault's content.
 *
 * Written about a fictional project (Harbour, a parcel-tracking service) rather
 * than copied from a real vault, so the corpus can live in a public repository.
 * Between them the notes cover every Markdown feature the indexer must handle:
 * frontmatter, aliases, tags, nested headings, code fences containing a hash,
 * wikilinks, an empty note and a folder meant to be excluded.
 */

export interface TestNote {
  path: string;
  content: string;
}

export const TEST_NOTES: readonly TestNote[] = [
  {
    path: "Decisions/Use Postgres for the write model.md",
    content: `---
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
See [[Read model on Elasticsearch]].`,
  },
  {
    path: "Decisions/Read model on Elasticsearch.md",
    content: `---
aliases: [ADR-002]
tags: [architecture, search]
---

# Read model on Elasticsearch

Tracking lookups are read-heavy and tolerate a second of staleness, so the read
model lives in Elasticsearch. Replication lag is monitored and alerts at ten seconds.`,
  },
  {
    path: "Decisions/Drop the GraphQL gateway.md",
    content: `---
tags: [architecture, api]
---

# Drop the GraphQL gateway

The gateway added a hop without reducing client round trips, so we removed it in
March. Clients now call the REST endpoints directly.`,
  },
  {
    path: "Decisions/Event ordering by parcel id.md",
    content: `---
tags: [architecture, events]
---

# Event ordering by parcel id

Events are partitioned by parcel id, which guarantees ordering per parcel without
requiring a global sequence.`,
  },
  {
    path: "Decisions/Retire the legacy SOAP endpoint.md",
    content: `---
tags: [api, deprecation]
---

# Retire the legacy SOAP endpoint

Two carriers still call the SOAP endpoint. It is frozen, and removal is scheduled
once both have migrated.`,
  },
  {
    path: "Engineering/Rate limiting.md",
    content: `---
tags: [api, reliability]
---

# Rate limiting

Public endpoints allow sixty requests per minute per API key. The limiter uses a
sliding window in Redis. Exceeding it returns 429 with a Retry-After header.`,
  },
  {
    path: "Engineering/Retry policy.md",
    content: `---
tags: [reliability]
---

# Retry policy

Failed webhook deliveries retry with exponential backoff, starting at two seconds
and giving up after six attempts.`,
  },
  {
    path: "Engineering/Webhook signing.md",
    content: `---
aliases: [HMAC webhooks]
tags: [security, api]
---

# Webhook signing

Every webhook carries an HMAC SHA-256 signature in the Harbour-Signature header.
Receivers must compare it in constant time.

\`\`\`bash
# This hash is a shell comment, not a heading
echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET"
\`\`\`

Secrets rotate every ninety days.`,
  },
  {
    path: "Engineering/Database migrations.md",
    content: `---
tags: [database, process]
---

# Database migrations

Migrations run before deployment, never during. Every migration must be reversible
and must not lock a table for more than one second.`,
  },
  {
    path: "Engineering/Connection pooling.md",
    content: `---
tags: [database, performance]
---

# Connection pooling

PgBouncer runs in transaction mode with a pool size of twenty per service.
Prepared statements are disabled because transaction mode does not support them.`,
  },
  {
    path: "Engineering/Caching strategy.md",
    content: `---
tags: [performance]
---

# Caching strategy

Tracking responses are cached for thirty seconds at the edge. Cache keys include
the parcel id and the requesting carrier.`,
  },
  {
    path: "Engineering/Logging conventions.md",
    content: `---
tags: [observability]
---

# Logging conventions

Logs are structured JSON. Every line carries a request id and a parcel id where one
applies. Personal data is never logged.`,
  },
  {
    path: "Engineering/Alert thresholds.md",
    content: `---
tags: [observability, reliability]
---

# Alert thresholds

We page when the error rate passes one percent over five minutes, or when
replication lag exceeds ten seconds.`,
  },
  {
    path: "Engineering/Feature flags.md",
    content: `---
tags: [process]
---

# Feature flags

Flags are evaluated server side and default to off. A flag older than ninety days
is treated as technical debt and removed.`,
  },
  {
    path: "Engineering/Timezone handling.md",
    content: `---
tags: [correctness]
---

# Timezone handling

All timestamps are stored in UTC. Only the presentation layer converts to the
carrier's local timezone.`,
  },
  {
    path: "Engineering/Idempotency keys.md",
    content: `---
tags: [api, correctness]
---

# Idempotency keys

Clients supply an idempotency key on every write. Keys are kept for twenty-four
hours, after which the same key is treated as a new request.`,
  },
  {
    path: "Engineering/Background jobs.md",
    content: `---
tags: [reliability]
---

# Background jobs

Jobs run on a separate worker fleet. A job that exceeds fifteen minutes is killed
and retried once.`,
  },
  {
    path: "Engineering/Error budget.md",
    content: `---
tags: [reliability, process]
---

# Error budget

The service targets 99.9 percent availability per quarter. Spending the budget
freezes feature work until reliability recovers.`,
  },
  {
    path: "Security/Secrets management.md",
    content: `---
tags: [security]
---

# Secrets management

Secrets live in the cloud secret manager, never in environment files committed to
git. Access is granted per service account.`,
  },
  {
    path: "Security/Authentication.md",
    content: `---
aliases: [Auth, Login]
tags: [security]
---

# Authentication

Staff sign in through SSO. API clients use OAuth 2.0 client credentials, and tokens
expire after one hour.`,
  },
  {
    path: "Security/Data retention.md",
    content: `---
tags: [security, compliance]
---

# Data retention

Parcel events are kept for two years, then deleted. Recipient addresses are purged
after ninety days.`,
  },
  {
    path: "Security/Penetration test 2026.md",
    content: `---
tags: [security]
---

# Penetration test 2026

The external test found three medium issues and no critical ones. All three were
fixed before the report was published.`,
  },
  {
    path: "Security/Dependency scanning.md",
    content: `---
tags: [security, process]
---

# Dependency scanning

Every pull request runs a vulnerability scan. A high severity finding blocks the
merge until it is resolved or formally accepted.`,
  },
  {
    path: "Product/Tracking page redesign.md",
    content: `---
tags: [product, design]
---

# Tracking page redesign

The redesign cut the tracking page to a single column and moved the map below the
status timeline. Support contacts about "where is my parcel" fell by a fifth.`,
  },
  {
    path: "Product/Delivery estimates.md",
    content: `---
tags: [product]
---

# Delivery estimates

Estimates are shown as a range of days rather than a single date, because a single
date reads as a promise we cannot keep.`,
  },
  {
    path: "Product/Notification preferences.md",
    content: `---
tags: [product]
---

# Notification preferences

Recipients choose email, SMS or neither. The default is email only, because SMS
costs money per message and annoys people who did not ask for it.`,
  },
  {
    path: "Product/Carrier onboarding.md",
    content: `---
tags: [product, process]
---

# Carrier onboarding

A new carrier is live in about three weeks: one week of mapping their status codes,
one week of testing, and one week running in parallel.`,
  },
  {
    path: "Product/Pricing model.md",
    content: `---
tags: [product, business]
---

# Pricing model

Pricing is per parcel tracked, with volume tiers. There is no monthly platform fee,
which removes the main objection from small carriers.`,
  },
  {
    path: "Product/Support volumes.md",
    content: `---
tags: [product, support]
---

# Support volumes

Support handles about four hundred contacts a week. Roughly half are status
questions that the tracking page should already answer.`,
  },
  {
    path: "Product/Mobile app decision.md",
    content: `---
tags: [product]
---

# Mobile app decision

We are not building a native app this year. Recipients arrive from a carrier's link
and do not install anything for a single parcel.`,
  },
  {
    path: "Meetings/2026-02-11 Architecture review.md",
    content: `---
tags: [meeting]
---

# Architecture review, 11 February 2026

Attendees agreed to split the read and write models. The ordering guarantee was
questioned and resolved by partitioning on parcel id.`,
  },
  {
    path: "Meetings/2026-03-04 Incident review.md",
    content: `---
tags: [meeting, incident]
---

# Incident review, 4 March 2026

The outage lasted forty minutes and was caused by connection pool exhaustion after
a migration held a lock. Two actions followed: a pool size alert and a migration
lock timeout.`,
  },
  {
    path: "Meetings/2026-04-22 Roadmap planning.md",
    content: `---
tags: [meeting, product]
---

# Roadmap planning, 22 April 2026

The quarter commits to carrier self-service onboarding and the notification
preferences work. The mobile app was explicitly deferred.`,
  },
  {
    path: "Meetings/2026-05-19 Security review.md",
    content: `---
tags: [meeting, security]
---

# Security review, 19 May 2026

Webhook signature verification was found missing in one sample client. The docs were
corrected and a verification snippet added.`,
  },
  {
    path: "Runbooks/Replication lag.md",
    content: `---
tags: [runbook, database]
---

# Runbook: replication lag

1. Check the publisher's write volume.
2. Check for long-running queries on the subscriber.
3. If lag exceeds sixty seconds, route reads to the primary.`,
  },
  {
    path: "Runbooks/Pool exhaustion.md",
    content: `---
tags: [runbook, database]
---

# Runbook: pool exhaustion

Symptoms are timeouts on every endpoint at once. Raise the PgBouncer pool, then find
the query holding connections. See [[Connection pooling]].`,
  },
  {
    path: "Runbooks/Carrier feed stopped.md",
    content: `---
tags: [runbook]
---

# Runbook: carrier feed stopped

Confirm the carrier is sending, check the signature on a sample payload, then replay
the missed window from the event archive.`,
  },
  {
    path: "Runbooks/Rolling back a deploy.md",
    content: `---
tags: [runbook, process]
---

# Runbook: rolling back a deploy

Roll forward where possible. A true rollback requires checking whether the deploy
included a migration, because migrations are not reversed automatically.`,
  },
  {
    path: "Research/Vector search evaluation.md",
    content: `---
tags: [research, search]
---

# Vector search evaluation

Embedding search improved recall on vaguely worded queries but doubled index build
time. Deferred until keyword search is exhausted.`,
  },
  {
    path: "Research/Queue comparison.md",
    content: `---
tags: [research]
---

# Queue comparison

Kafka, Pulsar and SQS were compared. Kafka won on ordering guarantees and existing
team familiarity, despite the operational cost.`,
  },
  {
    path: "Research/Address normalisation.md",
    content: `---
tags: [research, correctness]
---

# Address normalisation

Third-party normalisation handled ninety-four percent of addresses correctly. The
remaining six percent were mostly rural routes.`,
  },
  {
    path: "Research/Carbon reporting.md",
    content: `---
tags: [research, business]
---

# Carbon reporting

Per-parcel carbon figures need carrier vehicle data we do not receive. Reporting at
the route level is possible today.`,
  },
  {
    path: "Notes/Glossary.md",
    content: `---
aliases: [Terms, Vocabulary]
tags: [reference]
---

# Glossary

A **parcel** is one tracked item. A **leg** is one movement between two facilities.
A **scan** is a carrier status update attached to a leg.`,
  },
  {
    path: "Notes/Onboarding a new engineer.md",
    content: `---
tags: [process, reference]
---

# Onboarding a new engineer

Day one is laptop and access. Day two is reading the decision records. Day three is
shipping a small change to production.`,
  },
  {
    path: "Notes/Code review expectations.md",
    content: `---
tags: [process]
---

# Code review expectations

A review is expected within one working day. Reviewers comment on correctness and
clarity, and leave formatting to the linter.`,
  },
  {
    path: "Notes/Release cadence.md",
    content: `---
tags: [process]
---

# Release cadence

We release on demand, several times a day. There is no release train, and no
deployment on a Friday afternoon.`,
  },
  {
    path: "Notes/Empty note.md",
    content: "",
  },
  {
    path: "Notes/Markdown torture test.md",
    content: `---
tags: [reference]
---

# Markdown torture test

Text before any subheading.

## Code with hashes

\`\`\`python
# This comment must not become a heading
def parcel_id(raw):
    return raw.strip()
\`\`\`

~~~
# Neither must this one
~~~

## Nested headings

### Third level
Content under a third level heading.

#### Fourth level
Content under a fourth level heading.

## Inline tags and links

An inline tag #torture and a link to [[Glossary]].`,
  },
  {
    path: "Archive/Old pricing experiment.md",
    content: `---
tags: [archive, business]
---

# Old pricing experiment

A monthly platform fee was trialled for two months in 2025 and abandoned after small
carriers churned.`,
  },
  {
    path: "Archive/Deprecated status codes.md",
    content: `---
tags: [archive, api]
---

# Deprecated status codes

Status codes 90 through 99 were carrier specific and are no longer emitted.`,
  },
  {
    path: "Private/Salary bands.md",
    content: `---
tags: [private]
---

# Salary bands

This note exists only to prove folder exclusion. It mentions parcel tracking and
Postgres so that it would match searches if it were not excluded.`,
  },
  {
    path: "Private/Personal journal.md",
    content: `---
tags: [private]
---

# Personal journal

Another excluded note mentioning webhooks, rate limiting and Elasticsearch.`,
  },
];

/** The folder the exclusion tests expect to be hidden. */
export const EXCLUDED_FOLDER = "Private";
