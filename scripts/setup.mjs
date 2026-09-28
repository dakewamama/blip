#!/usr/bin/env node
/**
 * Copies the example env files into place if they are not already there.
 * Idempotent — never overwrites a file you have edited.
 */
import { copyFile, access } from "node:fs/promises";
import { constants } from "node:fs";

const pairs = [
  ["apps/api/.env.example", "apps/api/.env"],
  ["apps/web/.env.example", "apps/web/.env.local"],
];

for (const [from, to] of pairs) {
  try {
    await access(to, constants.F_OK);
    console.log(`· ${to} already exists, leaving it alone`);
  } catch {
    await copyFile(from, to);
    console.log(`✓ created ${to}`);
  }
}

console.log("\nSet SOLANA_RPC_URL in apps/api/.env to a private endpoint.");
console.log("On the public one, holder lookups get rate-limited and safety scores come back partial.\n");
