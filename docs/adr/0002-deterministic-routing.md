# ADR 0002 — Deterministic routing after the LLM

## Context
LLM output can drift, hallucinate, or be manipulated by prompt injection. A
classification is useful, but it must not directly authorise a business action.

## Decision
The model only proposes `sentiment`, `category`, `urgency`, and `summary`.
Routing to `normal`, `high_priority`, or `review` is a pure rule function over
validated fields. Any schema violation or provider failure routes to `review`.

## Consequences
- The routing policy is deterministic, explainable, and unit-testable.
- A malformed model response degrades safely instead of producing a fabricated
  success.
- The rules must be updated deliberately; they are not learned from data.
