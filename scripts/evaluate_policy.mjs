import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = JSON.parse(await readFile(path.join(ROOT, "n8n/feedbackops_ai.json"), "utf8"));
const cases = JSON.parse(await readFile(path.join(ROOT, "samples/eval_cases.json"), "utf8"));
const node = workflow.nodes.find((candidate) => candidate.name === "Deterministic Routing");
assert(node, "Deterministic Routing node is missing");
const decide = new vm.Script(`(function($json){${node.parameters.jsCode}})`).runInNewContext();

const counts = new Map();
const failures = [];
for (const testCase of cases) {
  const [output] = decide(testCase.input);
  const actual = output.json.routing_decision;
  const expected = testCase.expected_route;
  counts.set(expected, (counts.get(expected) || 0) + 1);
  if (actual !== expected) failures.push({ label: testCase.label, expected, actual });
}

const passed = cases.length - failures.length;
const accuracy = cases.length === 0 ? 0 : passed / cases.length;
const result = {
  generated_at: new Date().toISOString(),
  total: cases.length,
  passed,
  failed: failures.length,
  accuracy: Number(accuracy.toFixed(4)),
  routes: Object.fromEntries([...counts.entries()].sort()),
  failures,
};

await writeFile(
  path.join(ROOT, "docs/eval-results.json"),
  JSON.stringify(result, null, 2) + "\n",
  "utf8"
);

if (failures.length > 0) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(`policy evaluation: ${passed}/${cases.length} passed (${(accuracy * 100).toFixed(1)}%)`);
console.log(`routes: ${JSON.stringify(result.routes)}`);
