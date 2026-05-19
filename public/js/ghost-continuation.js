export class GhostContinuation {
  constructor(canvasManager) {
    this.canvas = canvasManager;
    this._animationId = null;
    this._fadeTimer = null;
    this._currentOpacity = 0;
  }

  pulse(stroke) {
    if (!stroke || stroke.points.length < 2) return;

    this.clear();

    const ctx = this.canvas.getGhostCtx();
    this._animatePulse(ctx, stroke);
  }

  clear() {
    cancelAnimationFrame(this._animationId);
    clearTimeout(this._fadeTimer);
    this._currentOpacity = 0;
    const ctx = this.canvas.getGhostCtx();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.ghostCanvas.width, this.canvas.ghostCanvas.height);
    ctx.restore();
    this.canvas.composite();
  }

  fadeOut(durationMs = 600) {
    const start = performance.now();
    const startOpacity = this._currentOpacity;

    const step = (now) => {
      const t = Math.min((now - start) / durationMs, 1);
      this._currentOpacity = startOpacity * (1 - t);
      this.canvas.setGhostOpacity(this._currentOpacity);
      this.canvas.composite();
      if (t < 1) {
        this._fadeTimer = requestAnimationFrame(step);
      } else {
        this.clear();
      }
    };
    this._fadeTimer = requestAnimationFrame(step);
  }

  _animatePulse(ctx, stroke) {
    const points = stroke.points;
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;

    let maxDist = 0;
    for (const p of points) {
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d > maxDist) maxDist = d;
    }
    const baseRadius = Math.max(maxDist + 10, 20);

    const duration = 800;
    const start = performance.now();
    this._currentOpacity = 0.15;
    this.canvas.setGhostOpacity(this._currentOpacity);

    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const easedT = Math.sin(t * Math.PI);
      const radius = baseRadius + easedT * 15;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.ghostCanvas.width, this.canvas.ghostCanvas.height);
      ctx.restore();

      ctx.globalAlpha = easedT * 0.6;
      ctx.strokeStyle = stroke.color || "#888";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      this.canvas.composite();

      if (t < 1) {
        this._animationId = requestAnimationFrame(step);
      } else {
        this._currentOpacity = 0.08;
        this.canvas.setGhostOpacity(this._currentOpacity);
      }
    };

    this._animationId = requestAnimationFrame(step);
  }
}
