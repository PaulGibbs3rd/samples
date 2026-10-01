/**
 * Renders a `CapabilityReport` into a container element. Pure DOM
 * rendering only — no ArcGIS SDK or network calls here, so this stays in
 * `ui/` per the module boundaries in `docs/architecture.md`.
 */
import type { CapabilitySupport, CapabilityReport } from "../arcgis/types.js";

function formatSupport(value: CapabilitySupport): string {
  if (value === "unknown") return "unknown";
  return value ? "yes" : "no";
}

function supportClass(value: CapabilitySupport): string {
  if (value === "unknown") return "support-unknown";
  return value ? "support-yes" : "support-no";
}

function renderRow(label: string, value: CapabilitySupport): string {
  return `<tr><th scope="row">${label}</th><td class="${supportClass(value)}">${formatSupport(value)}</td></tr>`;
}

function renderList(items: string[]): string {
  if (items.length === 0) return "<p class=\"empty\">None.</p>";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

export function renderCapabilityReport(container: HTMLElement, report: CapabilityReport): void {
  const modeLabel =
    report.mode === "demo-fixture"
      ? "DEMO FIXTURE (not a live service)"
      : report.mode === "not-configured"
        ? "NOT CONFIGURED"
        : "LIVE CHECK";

  const scene = report.scene;
  const featureLayer = report.associatedFeatureLayer;
  const mesh = report.meshQueryProbe;

  container.innerHTML = `
    <section class="report-mode report-mode--${report.mode}">
      <strong>Mode:</strong> ${modeLabel}
      <span class="timestamp">generated ${escapeHtml(report.generatedAt)}</span>
    </section>

    ${
      scene
        ? `<section>
      <h3>SceneLayer</h3>
      <table class="capability-table">
        <tbody>
          <tr><th scope="row">Title</th><td>${escapeHtml(scene.title ?? "(none)")}</td></tr>
          <tr><th scope="row">Source URL</th><td>${escapeHtml(scene.sourceUrl ?? "(none)")}</td></tr>
          <tr><th scope="row">geometryType</th><td>${escapeHtml(scene.geometryType ?? "unknown")}</td></tr>
          <tr><th scope="row">Is 3D Object SceneLayer</th><td class="${scene.isThreeDObjectSceneLayer ? "support-yes" : "support-no"}">${scene.isThreeDObjectSceneLayer ? "yes" : "no"}</td></tr>
          ${renderRow("supportsQuery", scene.supportsQuery)}
          ${renderRow("supportsReturnMesh", scene.supportsReturnMesh)}
          ${renderRow("supportsEditing", scene.supportsEditing)}
          ${renderRow("supportsGeometryUpdate", scene.supportsGeometryUpdate)}
          ${renderRow("supportsAdd", scene.supportsAdd)}
          ${renderRow("supportsUpdate", scene.supportsUpdate)}
          ${renderRow("supportsDelete", scene.supportsDelete)}
        </tbody>
      </table>
    </section>`
        : ""
    }

    ${
      featureLayer
        ? `<section>
      <h3>Associated FeatureLayer</h3>
      <table class="capability-table">
        <tbody>
          <tr><th scope="row">Found</th><td class="${featureLayer.found ? "support-yes" : "support-no"}">${featureLayer.found ? "yes" : "no"}</td></tr>
          <tr><th scope="row">Title</th><td>${escapeHtml(featureLayer.title ?? "(none)")}</td></tr>
          <tr><th scope="row">Source URL</th><td>${escapeHtml(featureLayer.sourceUrl ?? "(none)")}</td></tr>
          ${renderRow("supportsEditing", featureLayer.supportsEditing)}
          ${renderRow("supportsGeometryUpdate", featureLayer.supportsGeometryUpdate)}
          ${renderRow("supportsAdd", featureLayer.supportsAdd)}
          ${renderRow("supportsUpdate", featureLayer.supportsUpdate)}
          ${renderRow("supportsDelete", featureLayer.supportsDelete)}
          ${renderRow("Change tracking", featureLayer.changeTracking)}
        </tbody>
      </table>
      <p class="note">${escapeHtml(featureLayer.glbFormatNote)}</p>
    </section>`
        : ""
    }

    ${
      mesh
        ? `<section>
      <h3>Mesh query probe</h3>
      <table class="capability-table">
        <tbody>
          <tr><th scope="row">Attempted</th><td>${mesh.attempted ? "yes" : "no"}</td></tr>
          <tr><th scope="row">Object id</th><td>${mesh.objectId ?? "(none configured)"}</td></tr>
          <tr><th scope="row">Query succeeded</th><td>${mesh.success === null ? "n/a" : mesh.success ? "yes" : "no"}</td></tr>
          <tr><th scope="row">Mesh returned</th><td>${mesh.hasMesh === null ? "n/a" : mesh.hasMesh ? "yes" : "no"}</td></tr>
          <tr><th scope="row">Transform attributes present</th><td>${mesh.hasTransformAttributes === null ? "n/a" : mesh.hasTransformAttributes ? "yes" : "no"}</td></tr>
          ${mesh.error ? `<tr><th scope="row">Error</th><td class="support-no">${escapeHtml(mesh.error)}</td></tr>` : ""}
        </tbody>
      </table>
    </section>`
        : ""
    }

    <section>
      <h3>Blockers</h3>
      ${renderList(report.blockers)}
    </section>

    <section>
      <h3>Notes</h3>
      ${renderList(report.notes)}
    </section>
  `;
}
