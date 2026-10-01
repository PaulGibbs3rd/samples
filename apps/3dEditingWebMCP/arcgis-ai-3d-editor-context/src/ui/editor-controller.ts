/**
 * DOM wiring for milestone 1's editor panel. Delegates every SDK call and
 * session transition to `editing/commands.ts` and renders through the pure
 * `editor-view.ts` — this file only reads form inputs, calls a command, and
 * re-renders. Keep it free of `@arcgis/core` imports so the SDK boundary
 * stays in `editing/` and `arcgis/`, per `docs/architecture.md`'s module
 * layout.
 *
 * The `EditorCommands` instance is created by the caller (`main.ts`) and
 * passed in rather than constructed here, so the same instance can also be
 * handed to `webmcp/tool-adapter.ts` (milestone 2) — both the visible UI and
 * WebMCP tools must observe and mutate exactly one shared edit session.
 * `commands.subscribe()` re-renders on every change regardless of whether a
 * button click or a WebMCP tool call produced it, which is what lets an
 * agent's `propose_rotation` call show up in this same visible preview.
 */
import { createIdleSession } from "../editing/edit-session.js";
import type { EditorCommands } from "../editing/commands.js";
import { renderEditorPanel } from "./editor-view.js";

export interface EditorElements {
  panel: HTMLElement;
  objectIdInput: HTMLInputElement;
  selectButton: HTMLButtonElement;
  angleInput: HTMLInputElement;
  previewButton: HTMLButtonElement;
  applyButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  translateXInput: HTMLInputElement;
  translateYInput: HTMLInputElement;
  translateZInput: HTMLInputElement;
  previewTranslateButton: HTMLButtonElement;
  scaleFactorInput: HTMLInputElement;
  previewScaleButton: HTMLButtonElement;
}

export function mountEditor(elements: EditorElements, commands: EditorCommands): void {
  function setButtonsForStatus(status: string): void {
    const hasSelection = status !== "idle";
    const isPreviewing = status === "previewing";
    const isBusy = status === "applying";
    elements.previewButton.disabled = !hasSelection || isBusy;
    elements.previewTranslateButton.disabled = !hasSelection || isBusy;
    elements.previewScaleButton.disabled = !hasSelection || isBusy;
    elements.applyButton.disabled = !isPreviewing || isBusy;
    elements.cancelButton.disabled = !isPreviewing || isBusy;
    elements.selectButton.disabled = isBusy;
  }

  function renderNow(statusMessage: string): void {
    const { session, inspection } = commands.getState();
    renderEditorPanel(elements.panel, { session, inspection, statusMessage });
    setButtonsForStatus(session.status);
  }

  // Re-render on every state change, whether it came from a button click
  // below or from a WebMCP tool's execute() running in the background.
  commands.subscribe(({ session, inspection, statusMessage }) => {
    renderEditorPanel(elements.panel, { session, inspection, statusMessage });
    setButtonsForStatus(session.status);
  });

  elements.selectButton.addEventListener("click", () => {
    void (async () => {
      const objectId = Number(elements.objectIdInput.value);
      if (!Number.isFinite(objectId)) {
        renderNow("Enter a numeric object id to select.");
        return;
      }
      renderNow("Loading feature…");
      await commands.selectObject(objectId);
    })();
  });

  elements.previewButton.addEventListener("click", () => {
    const delta = Number(elements.angleInput.value);
    if (!Number.isFinite(delta)) {
      renderNow("Enter a finite rotation angle (degrees) to preview.");
      return;
    }
    commands.previewRotation(delta);
  });

  elements.previewTranslateButton.addEventListener("click", () => {
    const dx = Number(elements.translateXInput.value);
    const dy = Number(elements.translateYInput.value);
    const dz = Number(elements.translateZInput.value);
    if (![dx, dy, dz].every(Number.isFinite)) {
      renderNow("Enter finite dx/dy/dz values (spatial reference linear units) to preview.");
      return;
    }
    void commands.previewTranslation(dx, dy, dz);
  });

  elements.previewScaleButton.addEventListener("click", () => {
    const factor = Number(elements.scaleFactorInput.value);
    if (!Number.isFinite(factor) || factor <= 0) {
      renderNow("Enter a finite, positive scale factor to preview.");
      return;
    }
    commands.previewScale(factor);
  });

  elements.cancelButton.addEventListener("click", () => {
    commands.discardProposal();
  });

  elements.applyButton.addEventListener("click", () => {
    void commands.applyProposal();
  });

  renderEditorPanel(elements.panel, {
    session: createIdleSession(),
    inspection: null,
    statusMessage: "Enter an object id and select it to begin.",
  });
  setButtonsForStatus("idle");
}
