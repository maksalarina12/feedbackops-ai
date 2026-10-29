import { randomBytes, scryptSync } from "node:crypto";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const password = input.replace(/\r?\n$/, "");
if (!password) {
  console.error("usage: printf '%s' \"$PASSWORD\" | node scripts/hash_review_password.mjs");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
console.log(`scrypt$${salt.toString("hex")}$${hash.toString("hex")}`);
