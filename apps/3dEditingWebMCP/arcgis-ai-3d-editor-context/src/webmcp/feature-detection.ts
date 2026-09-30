/**
 * Feature detection for Chrome's WebMCP imperative API, per
 * `docs/architecture.md`: "Do not assume WebMCP is universally available...
 * Register tools only when `document.modelContext` is available." Isolated
 * here so both `tool-adapter.ts` and any future UI status indicator can
 * check support the same way.
 */
import "./types.js";

export function isWebMcpSupported(): boolean {
  return typeof document !== "undefined" && document.modelContext != null;
}
