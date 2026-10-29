#!/usr/bin/env python3
"""Build the optional escalation and weekly-digest n8n workflows.

Usage:
  python3 scripts/build_extra_workflows.py [webhook_cred_id] [webhook_cred_name]
      [n8n_api_cred_id] [n8n_api_cred_name]

Writes:
  n8n/escalation_workflow.json
  n8n/weekly_digest_workflow.json

Both workflows are templates: channel URLs and API credentials live in n8n
(or in the environment), never in the exported JSON.
"""
import json
import sys
import uuid

WEBHOOK_CRED_ID = sys.argv[1] if len(sys.argv) > 1 else "REPLACE_WITH_WEBHOOK_CRED_ID"
WEBHOOK_CRED_NAME = sys.argv[2] if len(sys.argv) > 2 else "FeedbackOps Webhook Auth"
API_CRED_ID = sys.argv[3] if len(sys.argv) > 3 else "REPLACE_WITH_N8N_API_CRED_ID"
API_CRED_NAME = sys.argv[4] if len(sys.argv) > 4 else "n8n API (header auth)"

VALIDATE_ESCALATION = """// Validate the escalation payload. Never trust inter-workflow input.
const body = $json.body ?? null;
const problems = [];
const isObj = body && typeof body === 'object' && !Array.isArray(body);
let requestId = 'unknown';
let route = 'review';
let summary = '';
let source = 'unknown';

if (!isObj) {
  problems.push('invalid_body');
} else {
  if (typeof body.request_id !== 'string' || body.request_id.trim() === '') {
    problems.push('request_id_missing');
  } else {
    requestId = body.request_id.trim().slice(0, 128);
  }
  if (typeof body.routing_decision !== 'string') {
    problems.push('routing_decision_missing');
  } else {
    route = body.routing_decision.trim().slice(0, 32);
  }
  if (body.source && typeof body.source === 'string') source = body.source.slice(0, 64);
  if (body.result && typeof body.result.summary === 'string') {
    summary = body.result.summary.slice(0, 300);
  }
}

let slackUrl = '';
try {
  slackUrl = (typeof $env !== 'undefined' && $env.SLACK_WEBHOOK_URL)
    ? String($env.SLACK_WEBHOOK_URL).trim()
    : '';
} catch (e) {
  slackUrl = '';
}

const icon = route === 'high_priority' ? ':rotating_light:' : ':mag:';
const text = [
  `${icon} *FeedbackOps escalation*`,
  `route: ${route}`,
  `request: ${requestId}`,
  `source: ${source}`,
  `summary: ${summary || '(none provided)'}`,
].join('\\n');

// Interactive human-in-the-loop buttons. The callback URL is configured once
// in the Slack app settings (Request URL) and must point at
// /api/slack/actions; Slack signs each callback so the endpoint can verify it.
const blocks = [
  { type: 'section', text: { type: 'mrkdwn', text } },
  {
    type: 'actions',
    elements: [
      {
        type: 'button',
        style: 'primary',
        text: { type: 'plain_text', text: 'Mark resolved' },
        value: `resolve:${requestId}`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Keep for review' },
        value: `needs_review:${requestId}`,
      },
    ],
  },
];

return [{ json: {
  valid: problems.length === 0,
  problems,
  request_id: requestId,
  route,
  source,
  summary,
  slack_enabled: slackUrl !== '',
  slack_url: slackUrl,
  text,
  blocks,
}}];
"""

BUILD_ESCALATION_RESULT = """// Return a deterministic result even when the channel is disabled or failing.
const base = $('Validate Escalation').first().json;
const result = {
  success: base.valid === true,
  request_id: base.request_id,
  route: base.route,
  channel: base.slack_enabled ? 'slack' : 'none',
  problems: base.problems || [],
};
console.log('[ESCALATION] ' + JSON.stringify(result));
return [{ json: result }];
"""

PREPARE_DIGEST_REQUEST = """// Resolve the n8n base URL without relying on $env in an expression.
let base = 'http://localhost:5678';
try {
  if (typeof $env !== 'undefined' && $env.N8N_BASE_URL) {
    base = String($env.N8N_BASE_URL).trim();
  }
} catch (e) {
  base = 'http://localhost:5678';
}
return [{ json: { base_url: base.replace(/\\/$/, '') } }];
"""

BUILD_DIGEST = """// Aggregate the last 7 days of n8n executions. No LLM needed for counts.
const payload = $json || {};
const items = Array.isArray(payload.data) ? payload.data : (Array.isArray(payload) ? payload : []);
const now = Date.now();
const windowMs = 7 * 24 * 60 * 60 * 1000;
const recent = items.filter((e) => {
  const t = Date.parse(e.startedAt || e.createdAt || e.stoppedAt || '');
  return Number.isFinite(t) && now - t <= windowMs;
});

const statusOf = (e) => (e.status || 'unknown').toLowerCase();
const success = recent.filter((e) => statusOf(e) === 'success').length;
const failed = recent.filter((e) => ['error', 'crashed', 'failed'].includes(statusOf(e))).length;
const running = recent.filter((e) => statusOf(e) === 'running').length;

const durations = recent
  .map((e) => {
    const start = Date.parse(e.startedAt || e.createdAt || '');
    const stop = Date.parse(e.stoppedAt || '');
    return Number.isFinite(start) && Number.isFinite(stop) ? stop - start : null;
  })
  .filter((d) => d !== null && d >= 0);
const avgMs = durations.length
  ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
  : null;

const rate = recent.length ? Math.round((success / recent.length) * 1000) / 10 : null;

let slackUrl = '';
try {
  slackUrl = (typeof $env !== 'undefined' && $env.SLACK_WEBHOOK_URL)
    ? String($env.SLACK_WEBHOOK_URL).trim()
    : '';
} catch (e) {
  slackUrl = '';
}

const text = [
  ':bar_chart: *FeedbackOps weekly digest*',
  `window: last 7 days`,
  `executions: ${recent.length}`,
  `success: ${success} | failed: ${failed} | running: ${running}`,
  `success rate: ${rate === null ? 'n/a' : rate + '%'}`,
  `avg duration: ${avgMs === null ? 'n/a' : avgMs + ' ms'}`,
].join('\\n');

return [{ json: {
  window_days: 7,
  total: recent.length,
  success,
  failed,
  running,
  success_rate_percent: rate,
  avg_duration_ms: avgMs,
  slack_enabled: slackUrl !== '',
  slack_url: slackUrl,
  text,
}}];
"""

DIGEST_LOG = """const i = $json;
const row = {
  generated_at: new Date().toISOString(),
  window_days: i.window_days,
  total: i.total,
  success: i.success,
  failed: i.failed,
  success_rate_percent: i.success_rate_percent,
  channel: i.slack_enabled ? 'slack' : 'none',
};
console.log('[DIGEST] ' + JSON.stringify(row));
return [{ json: row }];
"""


escalation_nodes = [
    {
        "id": str(uuid.uuid4()),
        "name": "Escalation Webhook",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [0, 240],
        "webhookId": str(uuid.uuid4()),
        "parameters": {
            "httpMethod": "POST",
            "path": "feedbackops-escalation",
            "responseMode": "responseNode",
            "authentication": "headerAuth",
            "options": {},
        },
        "credentials": {"httpHeaderAuth": {"id": WEBHOOK_CRED_ID, "name": WEBHOOK_CRED_NAME}},
        "notes": "Called by the main triage workflow when ESCALATION_WEBHOOK_URL is set.",
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Validate Escalation",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [224, 240],
        "parameters": {"jsCode": VALIDATE_ESCALATION},
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Escalation Valid?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.2,
        "position": [448, 240],
        "parameters": {
            "conditions": {
                "options": {
                    "caseSensitive": True,
                    "leftValue": "",
                    "typeValidation": "strict",
                    "version": 2,
                },
                "conditions": [
                    {
                        "id": "cond-escalation-valid",
                        "leftValue": "={{ $json.valid }}",
                        "rightValue": "",
                        "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                    }
                ],
                "combinator": "and",
            }
        },
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Slack Enabled?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.2,
        "position": [672, 140],
        "parameters": {
            "conditions": {
                "options": {
                    "caseSensitive": True,
                    "leftValue": "",
                    "typeValidation": "strict",
                    "version": 2,
                },
                "conditions": [
                    {
                        "id": "cond-slack-enabled",
                        "leftValue": "={{ $json.slack_enabled }}",
                        "rightValue": "",
                        "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                    }
                ],
                "combinator": "and",
            }
        },
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Post to Slack",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [896, 60],
        "parameters": {
            "method": "POST",
            "url": "={{ $json.slack_url }}",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify($json.blocks ? { text: $json.text, blocks: $json.blocks } : { text: $json.text }) }}",
            "options": {"timeout": 10000},
        },
        "onError": "continueRegularOutput",
        "alwaysOutputData": True,
        "notes": "Optional channel. Without SLACK_WEBHOOK_URL the workflow still responds.",
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Build Escalation Result",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1120, 240],
        "parameters": {"jsCode": BUILD_ESCALATION_RESULT},
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Respond to Escalation",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.4,
        "position": [1344, 240],
        "parameters": {
            "respondWith": "json",
            "responseBody": "={{ $json }}",
        },
    },
]

escalation_connections = {
    "Escalation Webhook": {"main": [[{"node": "Validate Escalation", "type": "main", "index": 0}]]},
    "Validate Escalation": {"main": [[{"node": "Escalation Valid?", "type": "main", "index": 0}]]},
    "Escalation Valid?": {"main": [
        [{"node": "Slack Enabled?", "type": "main", "index": 0}],
        [{"node": "Build Escalation Result", "type": "main", "index": 0}],
    ]},
    "Slack Enabled?": {"main": [
        [{"node": "Post to Slack", "type": "main", "index": 0}],
        [{"node": "Build Escalation Result", "type": "main", "index": 0}],
    ]},
    "Post to Slack": {"main": [[{"node": "Build Escalation Result", "type": "main", "index": 0}]]},
    "Build Escalation Result": {"main": [[{"node": "Respond to Escalation", "type": "main", "index": 0}]]},
}

escalation_workflow = {
    "name": "FeedbackOps AI - Escalation Notifier",
    "nodes": escalation_nodes,
    "connections": escalation_connections,
    "settings": {"executionOrder": "v1"},
}

digest_nodes = [
    {
        "id": str(uuid.uuid4()),
        "name": "Weekly Schedule",
        "type": "n8n-nodes-base.scheduleTrigger",
        "typeVersion": 1.2,
        "position": [0, 240],
        "parameters": {
            "rule": {
                "interval": [
                    {"field": "cronExpression", "expression": "0 8 * * 1"}
                ]
            }
        },
        "notes": "Every Monday at 08:00 in the instance timezone.",
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Prepare Digest Request",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [224, 240],
        "parameters": {"jsCode": PREPARE_DIGEST_REQUEST},
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Fetch Executions",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [448, 240],
        "parameters": {
            "method": "GET",
            "url": "={{ $json.base_url + '/api/v1/executions?limit=250' }}",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "options": {"timeout": 15000},
        },
        "credentials": {"httpHeaderAuth": {"id": API_CRED_ID, "name": API_CRED_NAME}},
        "notes": "Header Auth credential: X-N8N-API-KEY = your n8n API key.",
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Build Digest",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [672, 240],
        "parameters": {"jsCode": BUILD_DIGEST},
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Digest Slack Enabled?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.2,
        "position": [896, 240],
        "parameters": {
            "conditions": {
                "options": {
                    "caseSensitive": True,
                    "leftValue": "",
                    "typeValidation": "strict",
                    "version": 2,
                },
                "conditions": [
                    {
                        "id": "cond-digest-slack",
                        "leftValue": "={{ $json.slack_enabled }}",
                        "rightValue": "",
                        "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                    }
                ],
                "combinator": "and",
            }
        },
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Post Digest to Slack",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1120, 140],
        "parameters": {
            "method": "POST",
            "url": "={{ $json.slack_url }}",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify({ text: $json.text }) }}",
            "options": {"timeout": 10000},
        },
        "onError": "continueRegularOutput",
        "alwaysOutputData": True,
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Digest Log",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1344, 240],
        "parameters": {"jsCode": DIGEST_LOG},
    },
]

digest_connections = {
    "Weekly Schedule": {"main": [[{"node": "Prepare Digest Request", "type": "main", "index": 0}]]},
    "Prepare Digest Request": {"main": [[{"node": "Fetch Executions", "type": "main", "index": 0}]]},
    "Fetch Executions": {"main": [[{"node": "Build Digest", "type": "main", "index": 0}]]},
    "Build Digest": {"main": [[{"node": "Digest Slack Enabled?", "type": "main", "index": 0}]]},
    "Digest Slack Enabled?": {"main": [
        [{"node": "Post Digest to Slack", "type": "main", "index": 0}],
        [{"node": "Digest Log", "type": "main", "index": 0}],
    ]},
    "Post Digest to Slack": {"main": [[{"node": "Digest Log", "type": "main", "index": 0}]]},
}

digest_workflow = {
    "name": "FeedbackOps AI - Weekly Digest",
    "nodes": digest_nodes,
    "connections": digest_connections,
    "settings": {"executionOrder": "v1"},
}

for path, workflow in (
    ("n8n/escalation_workflow.json", escalation_workflow),
    ("n8n/weekly_digest_workflow.json", digest_workflow),
):
    with open(path, "w") as f:
        json.dump(workflow, f, indent=2)
    print(f"Wrote {path} with {len(workflow['nodes'])} nodes")
