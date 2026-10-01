/**
 * Minimal ambient types for Chrome's WebMCP imperative API
 * (`document.modelContext`). There is no official `@types` package for this
 * experimental API yet, so these are hand-written from the current Chrome
 * documentation (see docs/architecture.md's reference list: "Chrome WebMCP
 * imperative API"). Keep this file narrowly scoped to what
 * `webmcp/tool-adapter.ts` actually uses.
 */

export interface ModelContextToolAnnotations {
  /** True if the tool only reads state and has no side effects. */
  readOnlyHint?: boolean;
  /** True if the tool's output contains untrusted, service/user-originated content. */
  untrustedContentHint?: boolean;
  /** True if executing the tool has a significant, real-world, or non-reversible effect. */
  consequentialHint?: boolean;
  /** True if the tool is meant for developer/debugging use, not end-user agents. */
  debugging?: boolean;
}

export interface ModelContextToolExecuteContext {
  signal: AbortSignal;
}

export interface ModelContextToolDefinition<TInput = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: ModelContextToolAnnotations;
  execute: (input: TInput, context: ModelContextToolExecuteContext) => Promise<string> | string;
}

export interface ModelContextRegisterOptions {
  signal?: AbortSignal;
}

export interface ModelContext {
  registerTool(tool: ModelContextToolDefinition<any>, options?: ModelContextRegisterOptions): Promise<void>;
  getTools(options?: { fromOrigins?: string[] }): Promise<unknown[]>;
  executeTool(tool: unknown, input?: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>;
  addEventListener(type: "toolchange", listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: "toolchange", listener: EventListenerOrEventListenerObject): void;
}

declare global {
  interface Document {
    /** Present only in browsers/builds with WebMCP enabled (e.g. Chrome with the flag/origin trial on). */
    modelContext?: ModelContext;
  }
}

export {};
