# ADR 0004 — SQLite for the demo audit store

## Context
The review queue needs durable state, idempotent writes, and a realistic
migration path without requiring a database service in every demo environment.

## Decision
Use Node's built-in `node:sqlite` with a single append-only `audit_events` table.
A partial unique index makes audit writes idempotent per `request_id`; review
actions append events. The schema is created on first open, and legacy JSONL
rows are migrated automatically.

## Consequences
- One file and one volume cover local development and Docker Compose.
- SQLite is single-writer; it is not the production target for a multi-instance
  deployment. Postgres remains the documented next step, and the store API is
  small enough to replace without touching the UI.
