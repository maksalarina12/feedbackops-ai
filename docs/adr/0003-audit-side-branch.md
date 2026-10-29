# ADR 0003 — Audit persistence is a side branch

## Context
The caller needs a fast, truthful response. Persisting an audit row to a
separate store is useful but must not make triage fail or hang.

## Decision
Build the audit row in the main workflow, respond to the caller, and persist the
row from a side branch with `onError: continue`. The store is append-only and
review actions are separate events.

## Consequences
- A store outage cannot change the triage response.
- Audit writes can lag or fail silently unless monitored; `/api/health` and
  structured logs expose store failures.
- The event model preserves review history instead of rewriting rows.
