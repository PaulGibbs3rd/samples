/**
 * Pure DOM rendering for the milestone 1 editor panel — inspect summary,
 * preview state, and apply/cancel result. No SDK or session-mutation logic
 * here; `src/editing/editor-controller.ts` owns that and calls this after
 * each state transition. Mirrors the separation used by
 * `capability-report-view.ts` for milestone 0.
 */
import type { ApplyResult, EditSession } from "../editing/edit-session.js";
import type { ObjectInspection } from "../arcgis/object-transform.js";

export interface EditorViewModel {
  session: EditSession;
  inspection: ObjectInspection | null;
  /** Free-form status line, e.g. "Loading…" or a requery confirmation message. */
  statusMessage: string;
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function renderAttributesTable(attributes: Record<string, unknown>): string {
  const interestingKeys = Object.keys(attributes)
    .filter((key) => key.toLowerCase().startsWith("esri3do_") || /objectid/i.test(key))
    .sort();
  if (interestingKeys.length === 0) return "<p class=\"empty\">No esri3do_* attributes found.</p>";
  return `<table class="capability-table"><tbody>${interestingKeys
    .map((key) => `<tr><th scope="row">${escapeHtml(key)}</th><td>${escapeHtml(String(attributes[key]))}</td></tr>`)
    .join("")}</tbody></table>`;
}

function renderApplyResult(result: ApplyResult | null): string {
  if (!result) return "";
  const cls = result.success ? "support-yes" : "support-no";
  const label = result.success ? "Applied and confirmed by requery" : "Apply failed";
  return `<p class="${cls}">${escapeHtml(label)} (object ${result.objectId}, ${escapeHtml(result.appliedAt)})${
    result.error ? `: ${escapeHtml(result.error)}` : ""
  }</p>`;
}

export function renderEditorPanel(container: HTMLElement, model: EditorViewModel): void {
  const { session, inspection, statusMessage } = model;

  if (!session.selected || !inspection) {
    container.innerHTML = `<p class="empty">${escapeHtml(statusMessage || "Enter an object id and select it to begin.")}</p>`;
    return;
  }

  const original = session.original;
  const candidate = session.candidate;
  const footprint = inspection.footprintExtent;

  container.innerHTML = `
    <section>
      <h3>Selected object</h3>
      <p><strong>${escapeHtml(session.selected.displayName)}</strong> (object id ${session.selected.objectId})</p>
      ${
        footprint
          ? `<p class="note">Footprint extent: ${footprint.width.toFixed(2)} × ${footprint.height.toFixed(2)} ` +
            `(spatial reference ${footprint.spatialReferenceWkid ?? "unknown"})</p>`
          : `<p class="note">Footprint extent unavailable.</p>`
      }
      ${renderAttributesTable(session.selected.attributes)}
    </section>

    <section>
      <h3>Rotation</h3>
      <p>Current angle: <strong>${original ? original.rdeg.toFixed(2) : "?"}°</strong> around axis
        (${original ? `${original.rx.toFixed(2)}, ${original.ry.toFixed(2)}, ${original.rz.toFixed(2)}` : "?"})</p>
      ${
        candidate && session.pendingChange?.kind === "rotation"
          ? `<p class="report-mode report-mode--demo-fixture">Preview only — not saved: ${candidate.rdeg.toFixed(
              2,
            )}° (delta ${session.pendingChange.deltaDegrees.toFixed(2)}°)</p>`
          : ""
      }
    </section>

    <section>
      <h3>Translation</h3>
      <p>Current offset: <strong>${
        original ? `${original.tx.toFixed(2)}, ${original.ty.toFixed(2)}, ${original.tz.toFixed(2)}` : "?"
      }</strong> (spatial reference linear units)</p>
      ${
        candidate && session.pendingChange?.kind === "translation"
          ? `<p class="report-mode report-mode--demo-fixture">Preview only — not saved: ${candidate.tx.toFixed(
              2,
            )}, ${candidate.ty.toFixed(2)}, ${candidate.tz.toFixed(2)} (delta ${session.pendingChange.dx.toFixed(
              2,
            )}, ${session.pendingChange.dy.toFixed(2)}, ${session.pendingChange.dz.toFixed(2)})</p>`
          : ""
      }
    </section>

    <section>
      <h3>Scale</h3>
      <p>Current scale: <strong>${
        original ? `${original.sx.toFixed(2)}, ${original.sy.toFixed(2)}, ${original.sz.toFixed(2)}` : "?"
      }</strong></p>
      ${
        candidate && session.pendingChange?.kind === "scale"
          ? `<p class="report-mode report-mode--demo-fixture">Preview only — not saved: ${candidate.sx.toFixed(
              2,
            )}, ${candidate.sy.toFixed(2)}, ${candidate.sz.toFixed(2)} (factor ${session.pendingChange.factor.toFixed(
              2,
            )}×)</p>`
          : ""
      }
      <p role="status" class="status">${escapeHtml(statusMessage)}</p>
      ${renderApplyResult(session.lastApplyResult)}
      ${session.error ? `<p class="support-no">${escapeHtml(session.error)}</p>` : ""}
    </section>
  `;
}
