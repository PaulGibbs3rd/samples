// calcite-panel-print-tool.js
export class CalcitePanelPrintTool extends HTMLElement {
  constructor() {
    super();
    this.expand = null;
    this.screenshotTitle = "🗺️ My Custom Map Title"; // Default value
  }
  static get observedAttributes() {
    return ["screenshot-title"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "screenshot-title") {
      this.screenshotTitle = newValue || "🗺️ My Custom Map Title";
    }
  }
  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;

   // ✅ Ensure initial attribute is read and assigned
    const initialTitle = this.getAttribute("screenshot-title");
    if (initialTitle) {
      this.screenshotTitle = initialTitle;
    }
    
    const panel = document.createElement("calcite-panel");
    panel.heading = "Print Map";

    const button = document.createElement("calcite-button");
    button.id = "screenshotBtn";
    button.width = "full";
    button.appearance = "solid";
    button.scale = "m";
    button.iconStart = "camera";
    button.textContent = "Screenshot & Download";

    panel.appendChild(button);
    this.appendChild(panel);

    button.addEventListener("click", async () => {
      const view = window.view;
      if (!view) return;
      if (view.updating) {
        await view.whenLayerView(view.map.layers.getItemAt(0));
      }
      const screenshot = await view.takeScreenshot({ format: "png" });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const image = new Image();
      image.src = screenshot.dataUrl;

      image.onload = () => {
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);
        ctx.fillStyle = "black";
        ctx.font = "20px sans-serif";
        ctx.fillText(this.screenshotTitle, 20, 30); // ✅ Use dynamic title
        const dateStr = new Date().toLocaleDateString();
        ctx.fillText(`📅 ${dateStr}`, 20, canvas.height - 30);
        ctx.fillText(`Scale 1:${Math.round(view.scale)}`, 20, canvas.height - 60);
        const finalImage = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = finalImage;
        link.download = "map_screenshot.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };
    });

    require(["esri/widgets/Expand"], (Expand) => {
      const view = window.view;
      if (!view || this.expand) return;
      this.expand = new Expand({
        view,
        content: this,
        expandIconClass: "esri-icon-printer",
        expanded: false,
        group: "top-right"
      });
      view.ui.add(this.expand, "top-right");
    });
  }
}
customElements.define("calcite-panel-print-tool", CalcitePanelPrintTool);
