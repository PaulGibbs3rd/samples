# 🖨️ Calcite Panel Print Tool

A lightweight, reusable Web Component that adds a screenshot-and-download print tool to any ArcGIS MapView using the Calcite Design System and ArcGIS Maps SDK for JavaScript.

![screenshot](https://your-username.github.io/print-tool/preview.png)

---

## 🚀 Features

- 🖼️ Takes a screenshot of the current MapView
- 🧾 Overlays title, date, and map scale
- ⬇️ Downloads the image as a PNG
- 💡 Uses `calcite-panel` and `calcite-button` inside an `Expand` widget

---

## 🛠️ Installation

You can import the component directly from GitHub Pages:

```html
<!-- ArcGIS JS API -->
<script src="https://js.arcgis.com/4.29/"></script>

<!-- Calcite Design System -->
<script type="module" src="https://js.arcgis.com/calcite-components/2.4.0/calcite.esm.js"></script>
<link rel="stylesheet" href="https://js.arcgis.com/calcite-components/2.4.0/calcite.css" />

<!-- Print Tool Web Component -->
<script type="module" src="https://your-username.github.io/print-tool/calcite-panel-print-tool.js"></script>
