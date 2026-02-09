#!/usr/bin/env node

// Thin wrapper so npm correctly registers the "clawcontrol" binary.
// The actual CLI is powered by Bun (required by @opentui/core), so we
// re-exec with bun pointing at the bundled dist/index.js.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);

// Handle --version and --help without needing bun
if (args.includes("--version") || args.includes("-v")) {
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json");
  console.log(`clawcontrol v${pkg.version}`);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json");
  console.log(`
clawcontrol v${pkg.version}
${pkg.description}

Usage:
  clawcontrol            Launch the interactive TUI
  clawcontrol --help     Show this help message
  clawcontrol --version  Show the version number

Options:
  -h, --help     Show this help message
  -v, --version  Show the version number

Documentation & source:
  https://github.com/ipenywis/clawcontrol
`);
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const script = resolve(__dirname, "../dist/index.js");

try {
  execFileSync("bun", [script, ...args], {
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
