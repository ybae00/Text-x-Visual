import { BrushEngine } from "./brush-engine.js";
import { CanvasManager } from "./canvas-manager.js";
import { StrokeRecorder } from "./stroke-recorder.js";
import { GhostContinuation } from "./ghost-continuation.js";
import { AICollaborator } from "./ai-collaborator.js";

class App {
  constructor() {
    this.brush = new BrushEngine();
    this.canvas = new CanvasManager(
      document.getElementById("canvas-display"),
      document.getElementById("canvas-interaction")
    );
    this.recorder = new StrokeRecorder();
    this.ghost = new GhostContinuation(this.canvas);
    this.ai = new AICollaborator(this.canvas, this.recorder, this.ghost, {
      debounceMs: 300,
      autoMode: true,
    });

    this.isDrawing = false;
    this._brushCursor = null;
    this._hideTimer = null;

    this._createBrushCursor();
    this._bindCanvas();
    this._bindTools();
    this._bindColors();
    this._bindSize();
    this._bindActions();
    this._bindAI();
    this._bindKeyboard();
    this._bindAutoHide();
  }

  /* ─── Canvas Drawing ─── */
  _bindCanvas() {
    const el = document.getElementById("canvas-interaction");

    const getPos = (e) => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.5 };
    };

    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      const { x, y, pressure } = getPos(e);

      if (this.brush.currentBrush === "fill") {
        this.canvas.saveState();
        this.brush.fill(this.canvas.getUserCtx(), this.canvas.userCanvas, x * this.canvas.dpr, y * this.canvas.dpr);
        this.canvas.composite();
        return;
      }

      this.isDrawing = true;
      this.canvas.saveState();
      this.brush.beginStroke(this.canvas.getUserCtx(), x, y, pressure);
      this.recorder.beginStroke(x, y, {
        color: this.brush.color,
        size: this.brush.size,
        brush: this.brush.currentBrush,
        opacity: this.brush.opacity,
      });
      this.canvas.composite();
      this.ai.notifyStrokeStart();
    });

    el.addEventListener("pointermove", (e) => {
      const { x, y, pressure } = getPos(e);

      if (this._brushCursor) {
        this._brushCursor.style.left = e.clientX + "px";
        this._brushCursor.style.top = e.clientY + "px";
      }

      if (!this.isDrawing) return;
      this.brush.moveStroke(this.canvas.getUserCtx(), x, y, pressure);
      this.recorder.addPoint(x, y);
      this.canvas.composite();
    });

    const endDraw = () => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      this.brush.endStroke(this.canvas.getUserCtx());
      const stroke = this.recorder.endStroke();
      this.canvas.composite();
      this.ai.notifyStrokeEnd(stroke);
    };

    el.addEventListener("pointerup", endDraw);
    el.addEventListener("pointercancel", endDraw);
    el.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  }

  /* ─── Brush Tools ─── */
  _bindTools() {
    document.querySelectorAll(".dot-brush").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelector(".dot-brush.active")?.classList.remove("active");
        btn.classList.add("active");
        this.brush.setBrush(btn.dataset.tool);
        this._updateCursorSize();
      });
    });
  }

  /* ─── Colors ─── */
  _bindColors() {
    const picker = document.getElementById("color-picker");

    document.querySelectorAll(".dot-color").forEach((dot) => {
      dot.addEventListener("click", () => {
        document.querySelector(".dot-color.active")?.classList.remove("active");
        dot.classList.add("active");
        this.brush.setColor(dot.dataset.color);
        picker.value = dot.dataset.color;
      });
    });

    document.getElementById("custom-color-btn").addEventListener("click", () => picker.click());

    picker.addEventListener("input", (e) => {
      this.brush.setColor(e.target.value);
      document.querySelectorAll(".dot-color").forEach((d) => d.classList.remove("active"));
    });
  }

  /* ─── Brush Size ─── */
  _bindSize() {
    document.getElementById("brush-size").addEventListener("input", (e) => {
      this.brush.setSize(Number(e.target.value));
      this._updateCursorSize();
    });
  }

  /* ─── Actions ─── */
  _bindActions() {
    document.getElementById("btn-undo").addEventListener("click", () => this.canvas.undo());
    document.getElementById("btn-redo").addEventListener("click", () => this.canvas.redo());
    document.getElementById("btn-clear").addEventListener("click", () => {
      this.canvas.clear();
      this.recorder.clear();
      this.ai.cancel();
    });

    const toggleBtn = document.getElementById("btn-toggle-ai-layer");
    toggleBtn.addEventListener("click", () => {
      const vis = this.canvas.toggleAiVisible();
      toggleBtn.classList.toggle("active", vis);
    });

    document.getElementById("btn-ai-trigger").addEventListener("click", () => this.ai.trigger());
  }

  /* ─── AI State ─── */
  _bindAI() {
    const glow = document.getElementById("ai-glow");
    const whisper = document.getElementById("ai-whisper");
    const trigger = document.getElementById("btn-ai-trigger");

    this.ai.on("stateChange", ({ state, detail }) => {
      glow.className = "ai-glow";
      if (state === "thinking" || state === "drawing") glow.classList.add(state);

      trigger.disabled = state === "thinking" || state === "drawing";

      if (state === "thinking") this._showWhisper("recognizing...");
      else if (state === "drawing") this._showWhisper("responding...");
      else if (state === "error") {
        this._showWhisper(detail || "something went wrong");
        setTimeout(() => this._hideWhisper(), 3000);
      } else {
        this._hideWhisper();
      }
    });

    this.ai.on("complete", () => {
      this._showWhisper("done");
      setTimeout(() => this._hideWhisper(), 1500);
    });
  }

  _showWhisper(text) {
    const el = document.getElementById("ai-whisper");
    el.textContent = text;
    el.classList.add("visible");
  }

  _hideWhisper() {
    document.getElementById("ai-whisper").classList.remove("visible");
  }

  /* ─── Keyboard ─── */
  _bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? this.canvas.redo() : this.canvas.undo();
        return;
      }

      const toolKeys = { p: "pen", l: "pencil", m: "marker", e: "eraser" };
      if (toolKeys[e.key] && !e.metaKey && !e.ctrlKey) {
        const tool = toolKeys[e.key];
        document.querySelector(".dot-brush.active")?.classList.remove("active");
        document.querySelector(`[data-tool="${tool}"]`)?.classList.add("active");
        this.brush.setBrush(tool);
        this._updateCursorSize();
      }

      if (e.key === " " && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        this.ai.trigger();
      }
    });
  }

  /* ─── Auto-hide Controls ─── */
  _bindAutoHide() {
    const controls = document.getElementById("controls");
    const actions = document.getElementById("actions");

    const show = () => {
      controls.classList.add("visible");
      actions.classList.add("visible");
      clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(hide, 3000);
    };

    const hide = () => {
      if (this.isDrawing) return;
      controls.classList.remove("visible");
      actions.classList.remove("visible");
    };

    document.addEventListener("pointermove", show);
    document.addEventListener("pointerdown", () => clearTimeout(this._hideTimer));
    document.addEventListener("pointerup", () => { this._hideTimer = setTimeout(hide, 3000); });
    controls.addEventListener("pointerenter", () => clearTimeout(this._hideTimer));
    controls.addEventListener("pointerleave", () => { this._hideTimer = setTimeout(hide, 2000); });

    setTimeout(show, 500);
  }

  /* ─── Brush Cursor ─── */
  _createBrushCursor() {
    this._brushCursor = document.createElement("div");
    this._brushCursor.className = "brush-cursor";
    document.body.appendChild(this._brushCursor);
    this._updateCursorSize();
  }

  _updateCursorSize() {
    if (!this._brushCursor) return;
    const mult = this.brush.currentBrush === "marker" ? 3 : this.brush.currentBrush === "eraser" ? 2.5 : 1;
    const size = Math.max(this.brush.size * mult, 4);
    this._brushCursor.style.width = size + "px";
    this._brushCursor.style.height = size + "px";
  }
}

/* ─── Tutorial ─── */
class Tutorial {
  constructor() {
    this.overlay = document.getElementById("tutorial-overlay");
    if (!this.overlay) return;

    if (localStorage.getItem("cocreate-tutorial-seen")) {
      this.overlay.remove();
      return;
    }

    this.currentStep = 0;
    this.totalSteps = 3;
    this.btn = document.getElementById("tutorial-next");

    this.btn.addEventListener("click", () => this._advance());
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this._advance();
    });
  }

  _advance() {
    const prev = this.overlay.querySelector(`.tutorial-step[data-step="${this.currentStep}"]`);
    prev.classList.remove("active");
    prev.classList.add("exit");

    this.currentStep++;

    if (this.currentStep >= this.totalSteps) {
      this._dismiss();
      return;
    }

    const next = this.overlay.querySelector(`.tutorial-step[data-step="${this.currentStep}"]`);
    next.classList.add("active");

    this.overlay.querySelectorAll(".tutorial-dot").forEach((d, i) => {
      d.classList.toggle("active", i === this.currentStep);
    });

    if (this.currentStep === this.totalSteps - 1) {
      this.btn.textContent = "start drawing";
    }
  }

  _dismiss() {
    localStorage.setItem("cocreate-tutorial-seen", "1");
    this.overlay.classList.add("hidden");
    setTimeout(() => this.overlay.remove(), 600);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new Tutorial();
  window.app = new App();
});
