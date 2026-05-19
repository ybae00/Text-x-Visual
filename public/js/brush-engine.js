export class BrushEngine {
  constructor() {
    this.currentBrush = "pen";
    this.color = "#1a1a1a";
    this.size = 4;
    this.opacity = 1;
    this.lastPoint = null;
    this.points = [];
    this._velocities = [];
  }

  setBrush(name) {
    this.currentBrush = name;
  }

  setColor(color) {
    this.color = color;
  }

  setSize(size) {
    this.size = size;
  }

  setOpacity(opacity) {
    this.opacity = opacity;
  }

  beginStroke(ctx, x, y, pressure = 0.5) {
    this.points = [{ x, y, pressure }];
    this._velocities = [0];
    this.lastPoint = { x, y, pressure };

    const brush = this._getBrushConfig();
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (this.currentBrush === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = brush.opacity;
    }

    if (this.currentBrush === "pencil") {
      this._drawPencilDot(ctx, x, y, brush);
    } else if (this.currentBrush === "marker") {
      this._drawMarkerDot(ctx, x, y, brush);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, brush.size / 2, 0, Math.PI * 2);
      ctx.fillStyle = this.currentBrush === "eraser" ? "#000" : this.color;
      ctx.fill();
    }

    ctx.restore();
  }

  moveStroke(ctx, x, y, pressure = 0.5) {
    if (!this.lastPoint) return;

    const point = { x, y, pressure };
    this.points.push(point);

    const dx = x - this.lastPoint.x;
    const dy = y - this.lastPoint.y;
    const velocity = Math.sqrt(dx * dx + dy * dy);
    this._velocities.push(velocity);

    const brush = this._getBrushConfig();

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (this.currentBrush === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = brush.opacity;
    }

    switch (this.currentBrush) {
      case "pen":
        this._drawPenSegment(ctx, this.lastPoint, point, brush);
        break;
      case "pencil":
        this._drawPencilSegment(ctx, this.lastPoint, point, brush, velocity);
        break;
      case "marker":
        this._drawMarkerSegment(ctx, this.lastPoint, point, brush);
        break;
      case "eraser":
        this._drawPenSegment(ctx, this.lastPoint, point, brush);
        break;
    }

    ctx.restore();
    this.lastPoint = point;
  }

  endStroke(ctx) {
    this.lastPoint = null;
    const strokePoints = [...this.points];
    this.points = [];
    this._velocities = [];
    return strokePoints;
  }

  fill(ctx, canvas, x, y) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const w = canvas.width;
    const h = canvas.height;

    const targetIdx = (Math.floor(y) * w + Math.floor(x)) * 4;
    const targetR = data[targetIdx];
    const targetG = data[targetIdx + 1];
    const targetB = data[targetIdx + 2];
    const targetA = data[targetIdx + 3];

    const fillColor = this._hexToRgb(this.color);
    if (
      targetR === fillColor.r &&
      targetG === fillColor.g &&
      targetB === fillColor.b &&
      targetA === 255
    ) {
      return;
    }

    const tolerance = 32;
    const stack = [Math.floor(x), Math.floor(y)];
    const visited = new Uint8Array(w * h);

    const matches = (idx) => {
      return (
        Math.abs(data[idx] - targetR) <= tolerance &&
        Math.abs(data[idx + 1] - targetG) <= tolerance &&
        Math.abs(data[idx + 2] - targetB) <= tolerance &&
        Math.abs(data[idx + 3] - targetA) <= tolerance
      );
    };

    while (stack.length > 0) {
      const sy = stack.pop();
      const sx = stack.pop();

      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;

      const pos = sy * w + sx;
      if (visited[pos]) continue;

      const idx = pos * 4;
      if (!matches(idx)) continue;

      visited[pos] = 1;
      data[idx] = fillColor.r;
      data[idx + 1] = fillColor.g;
      data[idx + 2] = fillColor.b;
      data[idx + 3] = Math.round(this.opacity * 255);

      stack.push(sx + 1, sy);
      stack.push(sx - 1, sy);
      stack.push(sx, sy + 1);
      stack.push(sx, sy - 1);
    }

    ctx.putImageData(imageData, 0, 0);
  }

  _getBrushConfig() {
    const base = { size: this.size, opacity: this.opacity, color: this.color };

    switch (this.currentBrush) {
      case "pen":
        return { ...base };
      case "pencil":
        return { ...base, opacity: base.opacity * 0.6, size: base.size * 0.8 };
      case "marker":
        return { ...base, opacity: base.opacity * 0.4, size: base.size * 3 };
      case "eraser":
        return { ...base, size: base.size * 2.5 };
      default:
        return base;
    }
  }

  _drawPenSegment(ctx, from, to, brush) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = this.currentBrush === "eraser" ? "#000" : brush.color;
    ctx.lineWidth = brush.size;
    ctx.stroke();
  }

  _drawPencilDot(ctx, x, y, brush) {
    const count = Math.ceil(brush.size * 1.5);
    ctx.fillStyle = brush.color;
    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * brush.size;
      const oy = (Math.random() - 0.5) * brush.size;
      const r = Math.random() * 0.8 + 0.2;
      ctx.globalAlpha = brush.opacity * (Math.random() * 0.5 + 0.3);
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawPencilSegment(ctx, from, to, brush, velocity) {
    const dist = Math.sqrt(
      (to.x - from.x) ** 2 + (to.y - from.y) ** 2
    );
    const steps = Math.max(1, Math.ceil(dist / 2));

    ctx.fillStyle = brush.color;

    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;

      const jitter = brush.size * 0.6;
      const count = Math.ceil(brush.size * 0.8);

      for (let j = 0; j < count; j++) {
        const ox = (Math.random() - 0.5) * jitter;
        const oy = (Math.random() - 0.5) * jitter;
        ctx.globalAlpha = brush.opacity * (Math.random() * 0.4 + 0.2);
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, Math.random() * 0.8 + 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawMarkerDot(ctx, x, y, brush) {
    ctx.fillStyle = brush.color;
    ctx.globalAlpha = brush.opacity;
    ctx.beginPath();
    ctx.ellipse(x, y, brush.size / 2, brush.size / 3, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawMarkerSegment(ctx, from, to, brush) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = brush.color;
    ctx.lineWidth = brush.size;
    ctx.globalAlpha = brush.opacity;
    ctx.stroke();
  }

  _hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  }
}
