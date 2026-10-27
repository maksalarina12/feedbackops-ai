#!/usr/bin/env python3
"""Mock Gemini API for FeedbackOps AI integration tests.

Mimics the response envelope of Google's generateContent API. Behavior is
selected by a marker inside the request body's feedback text:
`[MOCK_BEHAVIOR:malformed|missingfield|invalidenum|timeout|ratelimit]`.
If no marker, returns a valid default classification.

Usage: python3 scripts/mock_gemini.py [port]   (default 8765)
"""
import json
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

MARKER = re.compile(r"\[MOCK_BEHAVIOR:(\w+)\]")


class Handler(BaseHTTPRequestHandler):
    def _respond(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length).decode()
        behavior = None
        try:
            body = json.loads(raw)
            text = body.get("contents", [{}])[0].get("parts", [{}])[0].get("text", "")
            m = MARKER.search(text)
            behavior = m.group(1) if m else None
        except Exception:
            behavior = "malformed"

        if behavior == "malformed":
            self._respond(200, {"candidates": [{"content": {"parts": [{"text": "{not-json-at-all"}]}}]})
        elif behavior == "missingfield":
            self._respond(200, {"candidates": [{"content": {"parts": [{"text": json.dumps(
                {"sentiment": "positive"})}]}}]})
        elif behavior == "invalidenum":
            self._respond(200, {"candidates": [{"content": {"parts": [{"text": json.dumps(
                {"sentiment": "POSITIVE", "category": "orbital", "urgency": "extreme",
                 "summary": "forced"})}]}}]})
        elif behavior == "timeout":
            time.sleep(35)
            self._respond(200, {"candidates": [{"content": {"parts": [{"text": "{}"}]}}]})
        elif behavior == "ratelimit":
            self._respond(429, {"error": {"code": 429, "message": "Resource exhausted (mock)",
                                          "status": "RESOURCE_EXHAUSTED"}})
        else:
            self._respond(200, {"candidates": [{"content": {"parts": [{"text": json.dumps(
                {"sentiment": "neutral", "category": "general", "urgency": "low",
                 "summary": "Mock default classification."})}]}}]})

    def log_message(self, fmt, *args):
        sys.stderr.write("[mock-gemini] " + (fmt % args) + "\n")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"mock gemini listening on :{port}", flush=True)
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
