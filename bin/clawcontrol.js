#!/usr/bin/env node

// Thin wrapper so npm correctly registers the "clawcontrol" binary.
// The actual CLI is powered by Bun (required by @opentui/core), so we
// re-exec with bun pointing at the bundled dist/index.js.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const script = resolve(__dirname, "../dist/index.js");

try {
  execFileSync("bun", [script, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
} catch (e) {
  if (e.code === "ENOENT") {
    console.error(
      "\n  ClawControl requires the Bun runtime." +
        "\n  Install it: curl -fsSL https://bun.sh/install | bash\n"
    );
    process.exit(1);
  }
  // Forward the child's exit code
  process.exit(e.status ?? 1);
}
