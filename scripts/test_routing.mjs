import fs from "node:fs";

const workflow = JSON.parse(
  fs.readFileSync(new URL("../n8n/feedbackops_ai.json", import.meta.url), "utf8")
);

const node = workflow.nodes.find((n) => n.name === "Deterministic Routing");
if (!node) {
  console.error("FAIL - Deterministic Routing node not found");
  process.exit(1);
}

const run = new Function("$json", node.parameters.jsCode);

const cases = [
  {
    name: "low urgency, known fields -> normal",
    input: { llm_error: null, result: { sentiment: "positive", category: "billing", urgency: "low" } },
    route: "normal",
    review: false,
  },
  {
    name: "high urgency -> high_priority",
    input: { llm_error: null, result: { sentiment: "negative", category: "billing", urgency: "high" } },
    route: "high_priority",
    review: true,
  },
  {
    name: "unknown category -> review",
    input: { llm_error: null, result: { sentiment: "neutral", category: "unknown", urgency: "low" } },
    route: "review",
    review: true,
  },
  {
    name: "unknown sentiment -> review",
    input: { llm_error: null, result: { sentiment: "unknown", category: "general", urgency: "low" } },
    route: "review",
    review: true,
  },
  {
    name: "llm_error wins over high urgency",
    input: { llm_error: "unparseable_llm_json", result: { sentiment: "positive", category: "billing", urgency: "high" } },
    route: "review",
    review: true,
  },
  {
    name: "high urgency wins over unknown field",
    input: { llm_error: null, result: { sentiment: "unknown", category: "unknown", urgency: "high" } },
    route: "high_priority",
    review: true,
  },
];

let failed = 0;
for (const testCase of cases) {
  const output = run(testCase.input)[0].json;
  const routeOk = output.routing_decision === testCase.route;
  const reviewOk = output.review_required === testCase.review;
  const suggestedOk = testCase.route === "normal"
    ? typeof output.suggested_response === "string" && output.suggested_response.length > 0
    : output.suggested_response === null;
  const reasonsOk = Array.isArray(output.routing_reasons) && output.routing_reasons.length > 0;

  if (routeOk && reviewOk && suggestedOk && reasonsOk) {
    console.log(`PASS - ${testCase.name}`);
  } else {
    failed += 1;
    console.error(
      `FAIL - ${testCase.name}: route=${output.routing_decision} ` +
      `review=${output.review_required} suggested=${JSON.stringify(output.suggested_response)} ` +
      `reasons=${JSON.stringify(output.routing_reasons)}`
    );
  }
}

// Grounding behavior: normal routes pick an entry from the embedded KB or fall
// back to the generic ack; ungrounded normal routes flag response_grounded=false.
const groundedOk = (() => {
  const out = run({ llm_error: null, feedback: "My package arrived late and tracking has not updated.", result: { sentiment: "negative", category: "shipping", urgency: "low" } })[0].json;
  return out.response_grounded === true && out.kb_source === "kb-shipping-delays";
})();
if (groundedOk) {
  console.log("PASS - grounded KB retrieval selects kb-shipping-delays");
} else {
  failed += 1;
  console.error("FAIL - grounded KB retrieval did not select kb-shipping-delays");
}

const ungroundedOk = (() => {
  const out = run({ llm_error: null, feedback: "Random gibberish zsxqvtkp about nothing.", result: { sentiment: "neutral", category: "general", urgency: "low" } })[0].json;
  return out.response_grounded === false && out.kb_source === null && out.suggested_response.includes("logged it");
})();
if (ungroundedOk) {
  console.log("PASS - ungrounded normal route falls back to generic response");
} else {
  failed += 1;
  console.error("FAIL - ungrounded normal route flags/fields wrong:", JSON.stringify({ grounded: ungroundedOk }));
}

console.log(`\n== ROUTING: ${cases.length + 2 - failed}/${cases.length + 2} passed ==`);
process.exit(failed === 0 ? 0 : 1);
