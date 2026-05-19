export class AICollaborator {
  constructor(canvasManager, strokeRecorder, ghostContinuation, options = {}) {
    this.canvas = canvasManager;
    this.recorder = strokeRecorder;
    this.ghost = ghostContinuation;
    this.debounceMs = options.debounceMs || 300;
    this.autoMode = options.autoMode ?? true;

    this._state = "idle";
    this._timer = null;
    this._abortController = null;
    this._listeners = new Map();
    this._snapshotBeforeAI = null;
  }

  get state() { return this._state; }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
  }

  _emit(event, data) {
    (this._listeners.get(event) || []).forEach((fn) => fn(data));
  }

  _setState(state, detail) {
    this._state = state;
    this._emit("stateChange", { state, detail });
  }

  notifyStrokeStart() {
    this._clearTimer();
  }

  notifyStrokeEnd(stroke) {
    if (!this.autoMode) return;
    if (!stroke) return;

    this.ghost.pulse(stroke);

    this._clearTimer();
    this._timer = setTimeout(() => {
      if (this.canvas.hasContent()) {
        this.trigger();
      }
    }, this.debounceMs);
  }

  async trigger(customPrompt) {
    if (this._state === "thinking" || this._state === "drawing") return;
    if (!this.canvas.hasContent()) {
      this._setState("idle");
      return;
    }

    this._clearTimer();
    this._setState("thinking");

    this._abortController = new AbortController();

    try {
      this._snapshotBeforeAI = this.canvas.getCompositeDataURL();

      const lastStroke = this.recorder.getLastStroke();
      const strokeMeta = lastStroke
        ? this.recorder.serializeForAPI(lastStroke)
        : null;

      const recentStrokes = this.recorder.getRecentStrokes(3)
        .map(s => this.recorder.serializeForAPI(s));

      const body = {
        image: this._snapshotBeforeAI,
        lastStroke: strokeMeta,
        recentStrokes,
        prompt: customPrompt || undefined,
      };

      const response = await fetch("/api/collaborate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: this._abortController.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.image) {
        this._setState("drawing");

        this.ghost.fadeOut(400);

        this.canvas.saveState();

        await this.canvas.applyAiImageFade(result.image, this._snapshotBeforeAI);

        this._setState("idle");
        this._emit("complete", result);
      } else {
        throw new Error(result.error || "No image returned");
      }
    } catch (err) {
      if (err.name === "AbortError") {
        this._setState("idle");
      } else {
        console.error("AI collaboration error:", err);
        this._setState("error", err.message);
        this.ghost.fadeOut(300);
        setTimeout(() => {
          if (this._state === "error") this._setState("idle");
        }, 3000);
      }
    } finally {
      this._abortController = null;
      this._snapshotBeforeAI = null;
    }
  }

  cancel() {
    this._clearTimer();
    this._abortController?.abort();
    this.ghost.clear();
    this._setState("idle");
  }

  _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}
