# FeedbackOps AI — Intelligent Customer Feedback Triage and Routing

An interview-ready demo of practical AI workflow engineering built on **n8n**
(self-hosted via Docker) + **Google Gemini** (free tier) + a **Next.js demo
frontend**.

Feedback arrives through one webhook. The AI classifies it
(sentiment/category/urgency/summary), a **deterministic rule layer** decides
routing (`normal` / `high_priority` / `review`), an audit row is logged, and a
structured JSON response is returned. Invalid input is rejected *before* the AI
is ever called; untrusted or failed AI output *never* becomes a successful
classification.

## Architecture at a glance

```
Webhook POST /webhook/feedbackops
   │
   ▼
[Validate & Normalize] ──✗──▶ [Build Error Response] ─┐
   │ valid                        (rejected pre-LLM)  │
   ▼                                                  │
[Gemini Classify] (structured output)                 │
   │                                                  ▼
[Validate LLM Output]  (schema re-check, fails safe)   │
   │                                                  │
[Deterministic Routing] (rules only, no LLM)          │
   │                                                  │
[Build Success Response]                              │
   │                                                  │
   └──────────────▶ [Audit Log (local)] ──────────────┴──▶ [Respond to Webhook]
```

Key engineering principle: **the LLM proposes, deterministic code disposes.**
See [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Stack

| Layer | Technology |
|---|---|
| Orchestration | n8n self-hosted (Docker), workflow `feedbackops_ai.json` |
| LLM | Google Gemini `gemini-3.5-flash` free tier (provider-agnostic adapter design; Claude-ready) |
| Frontend | Next.js 16 + TypeScript (demo UI with scenario buttons) |
| Audit log | n8n execution log (Google Sheets is a documented, intentionally-pending upgrade) |
| Tests | 20-scenario harness, live + mock-provider phases (`scripts/run_tests.py`) |

## Quick start

```bash
# 1. n8n (already running in Docker)
docker start n8n

# 2. Import the workflow (see SETUP.md for the full path)
curl -X POST http://localhost:5678/api/v1/workflows \
  -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json" \
  -d @n8n/feedbackops_ai.json

# 3. Demo UI
cd frontend && npm install && npm run dev   # http://localhost:3000

# 4. Tests
export N8N_API_KEY=... ; export N8N_WORKFLOW_ID=...
python3 scripts/run_tests.py --full
```

## Business story

Manually triaging every piece of customer feedback (read → classify → prioritise
→ route → log) is slow and inconsistent. FeedbackOps AI automates the first
pass: sub-10-second classification with consistent categories, explicit routing
of what needs a human, and a full audit trail per item. Time saved = number of
items × (manual processing time − human seconds after automation); assumptions
are disclosed rather than invented benchmarks (see `DEMO_SCRIPT.md`).

## Honest status

Every claim in this repo is backed by an executed test run; anything not
executed is explicitly disclosed. See [`TESTING.md`](TESTING.md) for the
evidence table and [`SECURITY.md`](SECURITY.md) for what is demo-grade versus
production-grade.

## Repository map

```
feedbackops-ai/
├── n8n/feedbackops_ai.json      # exact, importable workflow export
├── n8n/WORKFLOW_GUIDE.md        # node-by-node explanation + import steps
├── scripts/build_workflow.py    # reproducible workflow builder
├── scripts/run_tests.py         # 20-scenario test harness
├── scripts/mock_gemini.py       # deterministic mock LLM for failure-path tests
├── samples/synthetic_feedback.json
└── frontend/                    # Next.js demo UI
```
