/**
 * DOM wiring for milestone 1's editor panel. Delegates every SDK call and
 * session transition to `editing/commands.ts` and renders through the pure
 * `editor-view.ts` — this file only reads form inputs, calls a command, and
 * re-renders. Keep it free of `@arcgis/core` imports so the SDK boundary
 * stays in `editing/` and `arcgis/`, per `docs/architecture.md`'s module
 * layout.
 */
import type { AppConfig } from "../arcgis/config.js";
import { EditorCommands, createIdleSession, type EditSession } from "../editing/commands.js";
import type { ObjectInspection } from "../arcgis/object-transform.js";
import { renderEditorPanel } from "./editor-view.js";

export interface EditorElements {
  panel: HTMLElement;
  objectIdInput: HTMLInputElement;
  selectButton: HTMLButtonElement;
  angleInput: HTMLInputElement;
  previewButton: HTMLButtonElement;
  applyButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function mountEditor(elements: EditorElements, config: AppConfig): void {
  const commands = new EditorCommands(config);
  let session: EditSession = createIdleSession();
  let inspection: ObjectInspection | null = null;

  function setButtonsForStatus(): void {
    const hasSelection = session.status !== "idle";
    const isPreviewing = session.status === "previewing";
    const isBusy = session.status === "applying";
    elements.previewButton.disabled = !hasSelection || isBusy;
    elements.applyButton.disabled = !isPreviewing || isBusy;
    elements.cancelButton.disabled = !isPreviewing || isBusy;
    elements.selectButton.disabled = isBusy;
  }

  function render(statusMessage: string): void {
    renderEditorPanel(elements.panel, { session, inspection, statusMessage });
    setButtonsForStatus();
  }

  elements.selectButton.addEventListener("click", () => {
    void (async () => {
      const objectId = Number(elements.objectIdInput.value);
      if (!Number.isFinite(objectId)) {
        render("Enter a numeric object id to select.");
        return;
      }
      render("Loading feature…");
      try {
        const result = await commands.selectObject(objectId);
        session = result.session;
        inspection = result.inspection;
        render(result.statusMessage);
      } catch (err) {
        session = createIdleSession();
        inspection = null;
        render(`Selection failed: ${describeError(err)}`);
      }
    })();
  });

  elements.previewButton.addEventListener("click", () => {
    const delta = Number(elements.angleInput.value);
    if (!Number.isFinite(delta)) {
      render("Enter a finite rotation angle (degrees) to preview.");
      return;
    }
    try {
      const result = commands.previewRotation(session, delta);
      session = result.session;
      render(result.statusMessage);
    } catch (err) {
      render(`Preview failed: ${describeError(err)}`);
    }
  });

  elements.cancelButton.addEventListener("click", () => {
    const result = commands.discardProposal(session);
    session = result.session;
    render(result.statusMessage);
  });

  elements.applyButton.addEventListener("click", () => {
    void (async () => {
      render("Applying edit…");
      try {
        const result = await commands.applyProposal(session);
        session = result.session;
        inspection = result.inspection;
        render(result.statusMessage);
      } catch (err) {
        render(`Apply failed: ${describeError(err)}`);
      }
    })();
  });

  render("Enter an object id and select it to begin.");
}
