import "./style.css";

// Optional: If you're loading a secured portal/scene later.
// import { configureOAuth } from "./auth/configureOAuth";
// configureOAuth({ appId: "YOUR_APP_ID" });

import "@esri/calcite-components/components/calcite-shell";
import "@esri/calcite-components/components/calcite-navigation";
import "@esri/calcite-components/components/calcite-navigation-logo";
import "@arcgis/map-components/components/arcgis-scene";
import "@arcgis/map-components/components/arcgis-zoom";

import { hasSceneLayerTarget, loadConfig } from "./arcgis/config.js";
import { checkSceneLayerCapabilities } from "./arcgis/capability-check.js";
import { DEMO_CAPABILITY_REPORT } from "./arcgis/demo-fixture.js";
import { renderCapabilityReport } from "./ui/capability-report-view.js";
import { mountEditor } from "./ui/editor-controller.js";
import type { CapabilityReport } from "./arcgis/types.js";

const config = loadConfig();

const reportContainer = document.querySelector<HTMLElement>("#capability-report");
const statusEl = document.querySelector<HTMLElement>("#capability-status");
const runButton = document.querySelector<HTMLButtonElement>("#run-check");
const configSummaryEl = document.querySelector<HTMLElement>("#config-summary");
const sceneEl = document.querySelector("arcgis-scene");

if (configSummaryEl) {
  configSummaryEl.textContent = hasSceneLayerTarget(config)
    ? `Target: ${config.sceneLayerUrl ?? `portal item ${config.sceneLayerItemId}`}`
    : "Target: none configured — showing demo fixture (see .env.example).";
}

// Only render a live 3D scene when a WebScene item id is configured.
// Milestone 0 focuses on the capability report; the interactive editor UI
// around this scene is milestone 1.
if (sceneEl) {
  if (config.webSceneItemId) {
    sceneEl.setAttribute("item-id", config.webSceneItemId);
  } else {
    sceneEl.remove();
  }
}

function setStatus(message: string): void {
  if (statusEl) statusEl.textContent = message;
}

async function runCapabilityCheck(): Promise<void> {
  if (!reportContainer) return;

  if (!hasSceneLayerTarget(config)) {
    renderCapabilityReport(reportContainer, DEMO_CAPABILITY_REPORT);
    setStatus("Showing demo fixture — no test service configured.");
    return;
  }

  setStatus("Checking live service capabilities…");
  try {
    const report: CapabilityReport = await checkSceneLayerCapabilities(config);
    renderCapabilityReport(reportContainer, report);
    setStatus(
      report.blockers.length > 0 ? `Done — ${report.blockers.length} blocker(s) found.` : "Done — no blockers found.",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Capability check failed: ${message}`);
    renderCapabilityReport(reportContainer, {
      mode: "not-configured",
      generatedAt: new Date().toISOString(),
      scene: null,
      associatedFeatureLayer: null,
      meshQueryProbe: null,
      blockers: [message],
      notes: [],
    });
  }
}

runButton?.addEventListener("click", () => {
  void runCapabilityCheck();
});

// Run once on load so the page is useful without interaction.
void runCapabilityCheck();

// Milestone 1 editor: only wired up when a real test service is configured —
// there is nothing meaningful to select/rotate/apply against the demo fixture.
const editorPanel = document.querySelector<HTMLElement>("#editor-report");
const objectIdInput = document.querySelector<HTMLInputElement>("#object-id-input");
const selectButton = document.querySelector<HTMLButtonElement>("#select-object");
const angleInput = document.querySelector<HTMLInputElement>("#rotate-angle-input");
const previewButton = document.querySelector<HTMLButtonElement>("#preview-rotation");
const applyButton = document.querySelector<HTMLButtonElement>("#apply-rotation");
const cancelButton = document.querySelector<HTMLButtonElement>("#cancel-rotation");

if (
  editorPanel &&
  objectIdInput &&
  selectButton &&
  angleInput &&
  previewButton &&
  applyButton &&
  cancelButton
) {
  if (hasSceneLayerTarget(config)) {
    mountEditor(
      {
        panel: editorPanel,
        objectIdInput,
        selectButton,
        angleInput,
        previewButton,
        applyButton,
        cancelButton,
      },
      config,
    );
    if (config.testObjectId !== null) {
      objectIdInput.value = String(config.testObjectId);
    }
  } else {
    editorPanel.innerHTML =
      '<p class="empty">No test service configured — set VITE_SCENE_LAYER_URL or VITE_SCENE_LAYER_ITEM_ID to use the editor.</p>';
    for (const button of [selectButton, previewButton, applyButton, cancelButton]) button.disabled = true;
  }
}
