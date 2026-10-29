# ADR 0001 — Use n8n as the orchestrator

## Context
The project is a portfolio reference implementation that must be importable,
inspectable, and runnable without a dedicated backend deployment. Most of the
logic is request validation, one provider call, deterministic routing, and
side-effect fan-out.

## Decision
Use a self-hosted n8n workflow as the orchestration layer. Keep the LLM call in
an HTTP Request node and every consequential decision in Code nodes so the
export is the source of truth.

## Consequences
- Reviewers can open the workflow and see the full decision path.
- Validation and routing are testable offline by reading the exported JSON.
- n8n adds an operational dependency and limits how much custom code belongs in
  nodes; a production team with complex rules should extract a service.
