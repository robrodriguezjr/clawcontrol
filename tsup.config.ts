import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  clean: true,
  target: "es2022",
  platform: "node",
  // No shebang banner needed — dist/index.js is invoked by bin/clawcontrol.js
  // which explicitly delegates to `bun`.
  //
  // @opentui/core uses bun:ffi and Bun-specific import attributes, so it
  // must stay external and be resolved at runtime by the Bun runtime.
  external: [
    "@opentui/core",
    "@opentui/react",
    "react",
    "ssh2",
    "cpu-features",
  ],
});
