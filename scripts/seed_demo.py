#!/usr/bin/env python3
"""Seed the local review queue with realistic demo rows.

Usage:
    BASE_URL=http://localhost:3000 WEBHOOK_SECRET=... REVIEW_PASSWORD=... \
        REVIEW_USERNAME=reviewer python3 scripts/seed_demo.py

Works with Docker Compose (frontend on :3000) or `npm run dev`. The rows use
stable request IDs, so repeated runs do not duplicate audit records.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
SECRET = os.environ.get("WEBHOOK_SECRET", "")
HMAC_SECRET = os.environ.get("AUDIT_HMAC_SECRET", "")
REVIEW_PASSWORD = os.environ.get("REVIEW_PASSWORD", "")
REVIEW_USERNAME = os.environ.get("REVIEW_USERNAME", "reviewer")


def post(path, body, headers=None, cookie=None, signed=False):
    payload = json.dumps(body)
    request = urllib.request.Request(BASE_URL + path, data=payload.encode(), method="POST")
    request.add_header("Content-Type", "application/json")
    if cookie:
        request.add_header("Cookie", cookie)
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    if signed:
        for key, value in signed_headers(payload).items():
            request.add_header(key, value)
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, response.read(), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers


def signed_headers(payload):
    headers = {"X-Webhook-Secret": SECRET}
    if HMAC_SECRET:
        import hashlib
        import hmac

        timestamp = str(int(datetime.now(timezone.utc).timestamp() * 1000))
        signature = hmac.new(
            HMAC_SECRET.encode(),
            f"{timestamp}.{payload}".encode(),
            hashlib.sha256,
        ).hexdigest()
        headers["X-Audit-Timestamp"] = timestamp
        headers["X-Audit-Signature"] = signature
    return headers


def ts(minutes):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat().replace("+00:00", "Z")


ROWS = [
    {
        "request_id": "demo-1001",
        "created_at": ts(2),
        "source": "demo_ui",
        "sentiment": "negative",
        "category": "billing",
        "urgency": "high",
        "summary": "Charged twice for the same order and support has not replied.",
        "routing_decision": "high_priority",
        "review_status": "needs_review",
        "processing_duration_ms": 4820,
    },
    {
        "request_id": "demo-1002",
        "created_at": ts(9),
        "source": "api",
        "sentiment": "negative",
        "category": "technical_issue",
        "urgency": "unknown",
        "summary": "Export stalls at 90% for large CSVs; not sure whether it is our data or a bug.",
        "routing_decision": "review",
        "review_status": "needs_review",
        "processing_duration_ms": 3910,
    },
    {
        "request_id": "demo-1003",
        "created_at": ts(21),
        "source": "app_store_review",
        "sentiment": "positive",
        "category": "product_feedback",
        "urgency": "low",
        "summary": "Loving the new dashboard, the weekly digest is genuinely useful.",
        "routing_decision": "normal",
        "review_status": "auto",
        "processing_duration_ms": 2140,
    },
    {
        "request_id": "demo-1004",
        "created_at": ts(34),
        "source": "demo_ui",
        "sentiment": "negative",
        "category": "billing",
        "urgency": "high",
        "summary": "Refund has not arrived after 10 days; can someone check?",
        "routing_decision": "high_priority",
        "review_status": "needs_review",
        "processing_duration_ms": 3660,
    },
    {
        "request_id": "demo-1005",
        "created_at": ts(47),
        "source": "api",
        "summary": "Message rejected before the LLM was called.",
        "status": "rejected_pre_llm",
        "error_code": "feedback_exceeds_2000_chars",
    },
]


def main():
    if not SECRET:
        print("WEBHOOK_SECRET is required", file=sys.stderr)
        return 1

    for row in ROWS:
        status, body, _ = post("/api/audit", row, signed=True)
        print(f"audit {row['request_id']}: {status}")
        if status not in (201,):
            print(body.decode(errors="replace"), file=sys.stderr)
            return 1

    if REVIEW_PASSWORD:
        status, body, headers = post(
            "/api/auth/login",
            {"username": REVIEW_USERNAME, "password": REVIEW_PASSWORD},
        )
        if status != 200:
            print(f"login: {status} {body.decode(errors='replace')}", file=sys.stderr)
            return 1
        cookie = headers.get("Set-Cookie", "").split(";")[0]
        status, body, _ = post(
            "/api/review",
            {"request_id": "demo-1004", "status": "resolved"},
            cookie=cookie,
        )
        print(f"resolve demo-1004: {status}")
        if status != 200:
            print(body.decode(errors="replace"), file=sys.stderr)
            return 1
    else:
        print("REVIEW_PASSWORD not set; skipped resolve action")

    print(f"Seeded {len(ROWS)} rows at {BASE_URL}/review")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
