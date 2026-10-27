# DEMO_SCRIPT — screen recording plan + 2-minute talk

## Recording plan (3–5 min, obs/gnome-screen-recorder, 1080p min)

1. (0:00) Talking head intro or slide: business problem — manual triage is
   slow/inconsistent. Show ONE sentence of value framing.
2. (0:20) Show `frontend/`: type the **urgent billing** example, press
   Classify. While loading, narrate "request_id generation, validation,
   AI, re-validation, routing — you'll see each stage reflected".
3. (0:50) Result card: highlight `routing_decision: high_priority`,
   review badge, duration ms. Point out suggested_reply is a DRAFT (never an
   action the AI took).
4. (1:10) Switch to n8n (localhost:5678): open the workflow, click
   `Gemini Classify` — show the structured prompt + responseSchema; then
   `Deterministic Routing` — rules only, no LLM in the decision path.
5. (1:50) Submit the **prompt-injection** example from the UI. Result:
   treated as data → routed review. ("The model did not obey the attacker;
   the validator would have caught casing/schema drift anyway.")
6. (2:30) Submit the **empty feedback** example → instant rejection (18 ms),
   "input never reached the AI — zero tokens spent".
7. (3:00) Show the executions list + `[AUDIT]` line (request_id threading).
8. (3:20) Close with architecture trade-offs and next steps (Sheets bank,
   production auth, Postgres dedupe). Never claim live Sheets.

Contingency: if Gemini throttles during recording, capture the
**fallback state** on purpose: "this is the rate-limit path — see, the
response says review-required, not a fake success", then pause and retry
later (suite evidence covers behavior).

Payloads live in `samples/synthetic_feedback.json`.

## 2-minute English script (spoken)

"FeedbackOps AI is a small end-to-end workflow I built to show how I think
about AI automation. The problem it solves: support teams receive hundreds of
feedback messages every week, and humans read and route each one by hand —
slow, expensive, and inconsistent.

The system has three layers. Input arrives at an n8n webhook and passes
validation first — the feedback must be present, text, and short enough. That
check runs BEFORE the AI is called, so invalid input never spends tokens. Next,
the message goes into Gemini with a structured-output schema that defines the
categories. Here's the important part: the model is told the message is DATA,
not instructions. In the demo I submit an 'ignore all previous instructions'
attack; the workflow routes it to review instead of obeying.

Third, a deterministic rules layer makes all consequential decisions: high
urgency becomes a high-priority review queue, unknown or shaky results become
human-review items, routine feedback gets an auto reply draft. The AI proposes,
but code disposes — because I don't want a model, not to mention a prompt
injection, authorizing business actions.

And failures never fake success: when the provider is temporarily unavailable,
the response is still truthfully success-with-review, carrying the error.
Every request has an ID that flows through validation, the model call, and the
audit log.

I'd extend this same pattern in production: persistent audit trail, a real
human-review UI, durable dedupe, and an optional microservice if the routing
rules grow beyond what visual workflow nodes can express."

## Business value (methodology, not invented numbers)

manual time per item ≈ 2–4 min (read/classify/prioritise/route/log). After
automation: human touches only flagged items ≈ 30–60 s. Saving per 1 000
items/month ≈ 33–58 hours. Assumptions must be validated with the real
company's baseline; never present this as measured.
