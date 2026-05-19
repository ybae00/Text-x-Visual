export class CanvasManager {
  constructor(displayCanvas, interactionCanvas) {
    this.display = displayCanvas;
    this.interaction = interactionCanvas;
    this.displayCtx = displayCanvas.getContext("2d");

    this.userCanvas = document.createElement("canvas");
    this.userCtx = this.userCanvas.getContext("2d");

    this.aiCanvas = document.createElement("canvas");
    this.aiCtx = this.aiCanvas.getContext("2d");

    this.ghostCanvas = document.createElement("canvas");
    this.ghostCtx = this.ghostCanvas.getContext("2d");

    this.aiVisible = true;
    this.aiOpacity = 1;
    this._ghostOpacity = 0;
    this._aiRevealProgress = 1;
    this._revealAnim = null;

    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 30;

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize() {
    const canvasW = window.innerWidth;
    const canvasH = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    const oldUserData = this.userCanvas.width > 0
      ? this.userCtx.getImageData(0, 0, this.userCanvas.width, this.userCanvas.height)
      : null;
    const oldAiData = this.aiCanvas.width > 0
      ? this.aiCtx.getImageData(0, 0, this.aiCanvas.width, this.aiCanvas.height)
      : null;

    for (const c of [this.display, this.interaction, this.userCanvas, this.aiCanvas, this.ghostCanvas]) {
      c.width = canvasW * dpr;
      c.height = canvasH * dpr;
      c.style.width = canvasW + "px";
      c.style.height = canvasH + "px";
    }

    this.displayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.userCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.aiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ghostCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (oldUserData) this.userCtx.putImageData(oldUserData, 0, 0);
    if (oldAiData) this.aiCtx.putImageData(oldAiData, 0, 0);

    this.width = canvasW;
    this.height = canvasH;
    this.dpr = dpr;

    this.composite();
  }

  getUserCtx() { return this.userCtx; }
  getAiCtx() { return this.aiCtx; }
  getGhostCtx() { return this.ghostCtx; }

  setGhostOpacity(v) {
    this._ghostOpacity = v;
  }

  /* ─── Undo / Redo ─── */

  saveState() {
    this.undoStack.push({
      user: this.userCanvas.toDataURL(),
      ai: this.aiCanvas.toDataURL(),
    });
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push({ user: this.userCanvas.toDataURL(), ai: this.aiCanvas.toDataURL() });
    this._restoreState(this.undoStack.pop());
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push({ user: this.userCanvas.toDataURL(), ai: this.aiCanvas.toDataURL() });
    this._restoreState(this.redoStack.pop());
    return true;
  }

  _restoreState(state) {
    const load = (src, ctx, canvas) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          ctx.restore();
          resolve();
        };
        img.src = src;
      });
    Promise.all([
      load(state.user, this.userCtx, this.userCanvas),
      load(state.ai, this.aiCtx, this.aiCanvas),
    ]).then(() => this.composite());
  }

  clear() {
    this.saveState();
    for (const [ctx, c] of [[this.userCtx, this.userCanvas], [this.aiCtx, this.aiCanvas], [this.ghostCtx, this.ghostCanvas]]) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.restore();
    }
    this._ghostOpacity = 0;
    this.composite();
  }

  /* ─── Layer Visibility ─── */

  toggleAiVisible() {
    this.aiVisible = !this.aiVisible;
    this.composite();
    return this.aiVisible;
  }

  /* ─── Compositing ─── */

  composite() {
    const ctx = this.displayCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.display.width, this.display.height);

    if (this.aiVisible) {
      ctx.globalAlpha = this.aiOpacity * this._aiRevealProgress;
      ctx.drawImage(this.aiCanvas, 0, 0);
      ctx.globalAlpha = 1;
    }

    ctx.drawImage(this.userCanvas, 0, 0);

    if (this._ghostOpacity > 0.001) {
      ctx.globalAlpha = this._ghostOpacity;
      ctx.drawImage(this.ghostCanvas, 0, 0);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  /* ─── Snapshot for API ─── */

  getCompositeDataURL() {
    const temp = document.createElement("canvas");
    temp.width = this.userCanvas.width;
    temp.height = this.userCanvas.height;
    const ctx = temp.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, temp.width, temp.height);
    ctx.drawImage(this.aiCanvas, 0, 0);
    ctx.drawImage(this.userCanvas, 0, 0);
    return temp.toDataURL("image/png");
  }

  /* ─── Image Diffing ─── */

  diffImages(beforeDataURL, afterDataURL) {
    return new Promise((resolve) => {
      const imgBefore = new Image();
      const imgAfter = new Image();
      let loaded = 0;

      const onReady = () => {
        if (++loaded < 2) return;

        const w = imgAfter.width, h = imgAfter.height;
        const cBefore = document.createElement("canvas");
        cBefore.width = w; cBefore.height = h;
        const ctxB = cBefore.getContext("2d");
        ctxB.drawImage(imgBefore, 0, 0, w, h);

        const cAfter = document.createElement("canvas");
        cAfter.width = w; cAfter.height = h;
        const ctxA = cAfter.getContext("2d");
        ctxA.drawImage(imgAfter, 0, 0, w, h);

        const dataBefore = ctxB.getImageData(0, 0, w, h).data;
        const dataAfter = ctxA.getImageData(0, 0, w, h).data;

        const diffCanvas = document.createElement("canvas");
        diffCanvas.width = w; diffCanvas.height = h;
        const diffCtx = diffCanvas.getContext("2d");
        const diffData = diffCtx.createImageData(w, h);

        const threshold = 60;
        let changedPixels = 0;

        for (let i = 0; i < dataBefore.length; i += 4) {
          const dr = Math.abs(dataBefore[i] - dataAfter[i]);
          const dg = Math.abs(dataBefore[i + 1] - dataAfter[i + 1]);
          const db = Math.abs(dataBefore[i + 2] - dataAfter[i + 2]);

          if (dr + dg + db > threshold) {
            diffData.data[i] = dataAfter[i];
            diffData.data[i + 1] = dataAfter[i + 1];
            diffData.data[i + 2] = dataAfter[i + 2];
            diffData.data[i + 3] = 255;
            changedPixels++;
          }
        }

        diffCtx.putImageData(diffData, 0, 0);
        resolve({ diffCanvas, changedPixels, width: w, height: h });
      };

      imgBefore.onload = onReady;
      imgAfter.onload = onReady;
      imgBefore.src = beforeDataURL;
      imgAfter.src = afterDataURL;
    });
  }

  /* ─── Radial Reveal from Stroke Endpoint ─── */

  async applyAiImageAnimated(imageDataUrl, originX, originY, beforeDataURL) {
    cancelAnimationFrame(this._revealAnim);

    const { diffCanvas, changedPixels } = await this.diffImages(beforeDataURL, imageDataUrl);

    if (changedPixels < 10) {
      return;
    }

    const maxRadius = Math.sqrt(this.width ** 2 + this.height ** 2);
    const duration = 1500;
    const dpr = this.dpr;
    const ox = originX * dpr;
    const oy = originY * dpr;

    this._aiRevealProgress = 1;

    return new Promise((resolve) => {
      const startTime = performance.now();

      const step = (now) => {
        const t = Math.min((now - startTime) / duration, 1);
        const easedT = 1 - Math.pow(1 - t, 3);
        const radius = easedT * maxRadius * dpr;

        this.aiCtx.save();
        this.aiCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.aiCtx.clearRect(0, 0, this.aiCanvas.width, this.aiCanvas.height);

        this.aiCtx.beginPath();
        this.aiCtx.arc(ox, oy, radius, 0, Math.PI * 2);
        this.aiCtx.clip();
        this.aiCtx.drawImage(diffCanvas, 0, 0);
        this.aiCtx.restore();

        this.composite();

        if (t < 1) {
          this._revealAnim = requestAnimationFrame(step);
        } else {
          this.aiCtx.save();
          this.aiCtx.setTransform(1, 0, 0, 1, 0, 0);
          this.aiCtx.clearRect(0, 0, this.aiCanvas.width, this.aiCanvas.height);
          this.aiCtx.drawImage(diffCanvas, 0, 0);
          this.aiCtx.restore();
          this.composite();
          resolve();
        }
      };

      this._revealAnim = requestAnimationFrame(step);
    });
  }

  /* ─── Fade-in reveal for complementary drawings ─── */

  async applyAiImageFade(imageDataUrl, beforeDataURL) {
    cancelAnimationFrame(this._revealAnim);

    const { diffCanvas, changedPixels } = await this.diffImages(beforeDataURL, imageDataUrl);

    if (changedPixels < 10) return;

    const duration = 1200;

    return new Promise((resolve) => {
      const startTime = performance.now();

      const step = (now) => {
        const t = Math.min((now - startTime) / duration, 1);
        const easedT = 1 - Math.pow(1 - t, 3);

        this.aiCtx.save();
        this.aiCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.aiCtx.clearRect(0, 0, this.aiCanvas.width, this.aiCanvas.height);
        this.aiCtx.globalAlpha = easedT;
        this.aiCtx.drawImage(diffCanvas, 0, 0);
        this.aiCtx.restore();

        this._aiRevealProgress = 1;
        this.composite();

        if (t < 1) {
          this._revealAnim = requestAnimationFrame(step);
        } else {
          this.aiCtx.save();
          this.aiCtx.setTransform(1, 0, 0, 1, 0, 0);
          this.aiCtx.clearRect(0, 0, this.aiCanvas.width, this.aiCanvas.height);
          this.aiCtx.drawImage(diffCanvas, 0, 0);
          this.aiCtx.restore();
          this.composite();
          resolve();
        }
      };

      this._revealAnim = requestAnimationFrame(step);
    });
  }

  /* ─── Legacy full-image apply (fallback) ─── */

  async applyAiImage(imageDataUrl, animate = true) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.aiCtx.save();
        this.aiCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.aiCtx.clearRect(0, 0, this.aiCanvas.width, this.aiCanvas.height);
        this.aiCtx.drawImage(img, 0, 0, this.aiCanvas.width, this.aiCanvas.height);
        this.aiCtx.restore();
        if (animate) {
          this._fadeReveal(resolve);
        } else {
          this._aiRevealProgress = 1;
          this.composite();
          resolve();
        }
      };
      img.onerror = () => resolve();
      img.src = imageDataUrl;
    });
  }

  _fadeReveal(onComplete) {
    this._aiRevealProgress = 0;
    const duration = 1000;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      this._aiRevealProgress = 1 - Math.pow(1 - t, 3);
      this.composite();
      if (t < 1) requestAnimationFrame(step);
      else { this._aiRevealProgress = 1; this.composite(); onComplete?.(); }
    };
    requestAnimationFrame(step);
  }

  hasContent() {
    const data = this.userCtx.getImageData(0, 0, this.userCanvas.width, this.userCanvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  }
}
