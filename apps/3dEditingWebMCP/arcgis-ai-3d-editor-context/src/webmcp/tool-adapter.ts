/**
 * WebMCP tool registration. Per docs/architecture.md's "WebMCP surface"
 * table, milestone 2 shipped a deliberately small set: two scene/selection
 * read tools, an inspect tool, and `propose_rotation` + `discard_proposal`.
 * Milestone 3 extends the propose surface with `propose_translation` and
 * `propose_scale`, following the exact same pattern — all wrapping the same
 * `EditorCommands` the visible UI (`ui/editor-controller.ts`) uses.
 * `apply_proposal` is intentionally NOT registered here — per
 * architecture.md, persistence stays behind the app's own visible Apply
 * button (the human approval gate); a WebMCP tool call must never be
 * treated as that approval.
 *
 * Tools are only registered when `document.modelContext` exists (feature
 * detection in `feature-detection.ts`) and the ordinary UI keeps working
 * whether or not that's the case.
 */
import "./types.js";
import { isWebMcpSupported } from "./feature-detection.js";
import type { EditorCommands } from "../editing/commands.js";
import { summarizeInspection, summarizeScene, summarizeSelection } from "./summaries.js";
import type { ModelContextToolDefinition } from "./types.js";

function buildTools(commands: EditorCommands): ModelContextToolDefinition<any>[] {
  return [
    {
      name: "get_scene",
      description:
        "Summarize the currently configured 3D Object SceneLayer and whether its associated, editable FeatureLayer has finished loading.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => JSON.stringify(summarizeScene(commands.getConfig(), commands.isFeatureLayerLoaded())),
    },
    {
      name: "get_selection",
      description:
        "Return the currently selected object's identity, its last service-confirmed rotation angle, and any pending (unsaved) rotation preview. Selection itself is only made through the visible UI.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => JSON.stringify(summarizeSelection(commands.getState().session)),
    },
    {
      name: "inspect_selected_object",
      description:
        "Return the currently selected object's footprint extent and esri3do_* transform (rotation angle/axis, translation, scale). Returns a short message instead if nothing is selected.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => {
        const { inspection } = commands.getState();
        if (!inspection) {
          return "No object is currently selected. Ask the user to select one in the app first.";
        }
        return JSON.stringify(summarizeInspection(inspection));
      },
    },
    {
      name: "propose_rotation",
      description:
        "Propose rotating the currently selected object by a relative angle in degrees around its existing (fixed) rotation axis. This only creates a local, visible preview in the app — it never writes to the service. The user must click Apply in the app to persist it.",
      inputSchema: {
        type: "object",
        properties: {
          deltaDegrees: {
            type: "number",
            description:
              "Relative rotation to add to the current angle, in degrees. May be positive or negative; the resulting angle wraps to [0, 360).",
          },
        },
        required: ["deltaDegrees"],
      },
      annotations: { readOnlyHint: false, consequentialHint: false },
      execute: ({ deltaDegrees }: { deltaDegrees: number }) => {
        if (typeof deltaDegrees !== "number" || !Number.isFinite(deltaDegrees)) {
          return "deltaDegrees must be a finite number of degrees.";
        }
        return commands.previewRotation(deltaDegrees).statusMessage;
      },
    },
    {
      name: "propose_translation",
      description:
        "Propose moving the currently selected object by relative (dx, dy, dz) deltas, expressed in the associated FeatureLayer's spatial reference linear units (e.g. meters). Rejected on a geographic (degree-based) spatial reference. This only creates a local, visible preview in the app — it never writes to the service. The user must click Apply in the app to persist it.",
      inputSchema: {
        type: "object",
        properties: {
          dx: { type: "number", description: "Delta along the x axis, in the layer's spatial reference linear units." },
          dy: { type: "number", description: "Delta along the y axis, in the layer's spatial reference linear units." },
          dz: { type: "number", description: "Delta along the z (vertical) axis, in the layer's spatial reference linear units." },
        },
        required: ["dx", "dy", "dz"],
      },
      annotations: { readOnlyHint: false, consequentialHint: false },
      execute: async ({ dx, dy, dz }: { dx: number; dy: number; dz: number }) => {
        if (![dx, dy, dz].every((value) => typeof value === "number" && Number.isFinite(value))) {
          return "dx, dy, and dz must all be finite numbers.";
        }
        const result = await commands.previewTranslation(dx, dy, dz);
        return result.statusMessage;
      },
    },
    {
      name: "propose_scale",
      description:
        "Propose scaling the currently selected object uniformly by a positive factor applied to all three axes (e.g. 1.1 grows it 10%, 0.9 shrinks it 10%). This only creates a local, visible preview in the app — it never writes to the service. The user must click Apply in the app to persist it.",
      inputSchema: {
        type: "object",
        properties: {
          factor: {
            type: "number",
            description: "Uniform scale multiplier applied to the object's current scale. Must be finite and strictly positive.",
          },
        },
        required: ["factor"],
      },
      annotations: { readOnlyHint: false, consequentialHint: false },
      execute: ({ factor }: { factor: number }) => {
        if (typeof factor !== "number" || !Number.isFinite(factor) || factor <= 0) {
          return "factor must be a finite, positive number.";
        }
        return commands.previewScale(factor).statusMessage;
      },
    },
    {
      name: "discard_proposal",
      description:
        "Discard any pending rotation, translation, or scale preview for the currently selected object, restoring its last service-confirmed transform. Does not affect values already applied and persisted by the user.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: false, consequentialHint: false },
      execute: () => commands.discardProposal().statusMessage,
    },
  ];
}

/**
 * Registers the milestone 2 tool set against `document.modelContext`, if
 * present. Returns a cleanup function that unregisters every tool (safe to
 * call even when WebMCP was never available).
 */
export function registerWebMcpTools(commands: EditorCommands): () => void {
  if (!isWebMcpSupported()) {
    return () => {};
  }
  const modelContext = document.modelContext;
  if (!modelContext) {
    return () => {};
  }
  const controller = new AbortController();
  for (const tool of buildTools(commands)) {
    void modelContext.registerTool(tool, { signal: controller.signal });
  }
  return () => controller.abort();
}
