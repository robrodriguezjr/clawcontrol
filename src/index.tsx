import { createRequire } from "node:module";
import { release } from "node:os";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App.js";

const args = process.argv.slice(2);

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

// macOS Terminal.app only gains true color support in macOS 26 (Tahoe), which
// ships with Darwin kernel 25.x.  Earlier versions mis-render 24-bit RGB
// escape sequences produced by the opentui native renderer.
const isAppleTerminal = process.env.TERM_PROGRAM === "Apple_Terminal";
const darwinMajor = process.platform === "darwin" ? parseInt(release(), 10) : Infinity;
const lacksTrueColor = isAppleTerminal && darwinMajor < 25;

async function main() {
  const renderer = await createCliRenderer({
    useMouse: true,
  });
  const root = createRoot(renderer);
  root.render(<App lacksTrueColor={lacksTrueColor} />);
}

main().catch(console.error);
