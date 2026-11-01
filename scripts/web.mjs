#!/usr/bin/env node
/**
 * Runs one branded instance of apps/web.
 *
 *   node scripts/web.mjs <dev|build|start> <brand> [port]
 *
 * Every brand is the same codebase built with a different NEXT_PUBLIC_BRAND.
 * Each gets its own build directory, so all of them can run side by side from
 * one checkout without overwriting each other's .next output.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [command, brand = "blip", port] = process.argv.slice(2);

if (!["dev", "build", "start"].includes(command)) {
  console.error("usage: node scripts/web.mjs <dev|build|start> <brand> [port]");
  process.exit(1);
}

const args = ["next", command];
if (port && command !== "build") args.push("-p", port);

const child = spawn("npx", args, {
  cwd: fileURLToPath(new URL("../apps/web", import.meta.url)),
  env: {
    ...process.env,
    NEXT_PUBLIC_BRAND: brand,
    NEXT_DIST_DIR: brand === "blip" ? ".next" : `.next-${brand}`,
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
