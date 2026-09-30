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
