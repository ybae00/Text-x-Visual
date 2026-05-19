export class StrokeRecorder {
  constructor(maxHistory = 50) {
    this._strokes = [];
    this._maxHistory = maxHistory;
    this._current = null;
  }

  beginStroke(x, y, { color, size, brush, opacity }) {
    this._current = {
      points: [{ x, y }],
      color,
      size,
      brush,
      opacity,
      startTime: performance.now(),
    };
  }

  addPoint(x, y) {
    if (!this._current) return;
    this._current.points.push({ x, y });
  }

  endStroke() {
    if (!this._current) return null;

    const stroke = this._current;
    this._current = null;

    const pts = stroke.points;
    if (pts.length < 2) return null;

    stroke.start = pts[0];
    stroke.end = pts[pts.length - 1];
    stroke.direction = this._computeDirection(pts);
    stroke.curvature = this._classifyCurvature(pts);
    stroke.bbox = this._computeBBox(pts);
    stroke.duration = performance.now() - stroke.startTime;

    if (stroke.curvature.type === "arc") {
      stroke.arcFit = stroke.curvature.fit;
    }

    this._strokes.push(stroke);
    if (this._strokes.length > this._maxHistory) {
      this._strokes.shift();
    }

    return stroke;
  }

  getLastStroke() {
    return this._strokes[this._strokes.length - 1] || null;
  }

  getRecentStrokes(n = 3) {
    return this._strokes.slice(-n);
  }

  getAllStrokes() {
    return this._strokes;
  }

  clear() {
    this._strokes = [];
    this._current = null;
  }

  _computeDirection(pts) {
    const tail = pts.slice(-Math.min(8, pts.length));
    if (tail.length < 2) return { dx: 0, dy: 0, angle: 0 };

    let dx = 0, dy = 0, weight = 0;
    for (let i = 1; i < tail.length; i++) {
      const w = i;
      dx += (tail[i].x - tail[i - 1].x) * w;
      dy += (tail[i].y - tail[i - 1].y) * w;
      weight += w;
    }
    dx /= weight;
    dy /= weight;

    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      dx: dx / len,
      dy: dy / len,
      angle: Math.atan2(dy, dx) * (180 / Math.PI),
    };
  }

  _classifyCurvature(pts) {
    if (pts.length < 5) return { type: "straight", confidence: 1 };

    const sampled = this._samplePoints(pts, Math.min(20, pts.length));
    const fit = this._fitCircle(sampled);

    if (fit && fit.error < 0.15) {
      const arcSpan = this._computeArcSpan(sampled, fit);
      return { type: "arc", confidence: 1 - fit.error, fit: { ...fit, arcSpan } };
    }

    const lineError = this._lineError(sampled);
    if (lineError < 0.05) {
      return { type: "straight", confidence: 1 - lineError };
    }

    return { type: "freeform", confidence: 0.5 };
  }

  _fitCircle(pts) {
    const n = pts.length;
    if (n < 3) return null;

    let sx = 0, sy = 0;
    for (const p of pts) { sx += p.x; sy += p.y; }
    const mx = sx / n, my = sy / n;

    let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
    for (const p of pts) {
      const u = p.x - mx, v = p.y - my;
      suu += u * u; suv += u * v; svv += v * v;
      suuu += u * u * u; svvv += v * v * v;
      suvv += u * v * v; svuu += v * u * u;
    }

    const det = suu * svv - suv * suv;
    if (Math.abs(det) < 1e-10) return null;

    const uc = (svv * (suuu + suvv) - suv * (svvv + svuu)) / (2 * det);
    const vc = (suu * (svvv + svuu) - suv * (suuu + suvv)) / (2 * det);
    const cx = uc + mx;
    const cy = vc + my;
    const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);

    let totalError = 0;
    for (const p of pts) {
      const dist = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
      totalError += Math.abs(dist - r) / r;
    }
    const error = totalError / n;

    return { cx, cy, r, error };
  }

  _computeArcSpan(pts, fit) {
    const angles = pts.map(p => Math.atan2(p.y - fit.cy, p.x - fit.cx));
    const startAngle = angles[0];
    const endAngle = angles[angles.length - 1];

    let span = endAngle - startAngle;
    if (span > Math.PI) span -= 2 * Math.PI;
    if (span < -Math.PI) span += 2 * Math.PI;

    let crossPositive = 0, crossNegative = 0;
    for (let i = 1; i < angles.length; i++) {
      let d = angles[i] - angles[i - 1];
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      if (d > 0) crossPositive++;
      else crossNegative--;
    }
    const clockwise = crossNegative > crossPositive;

    return { startAngle, endAngle, span, clockwise };
  }

  _lineError(pts) {
    if (pts.length < 3) return 0;
    const first = pts[0], last = pts[pts.length - 1];
    const dx = last.x - first.x, dy = last.y - first.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return 1;

    let totalDist = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const px = pts[i].x - first.x, py = pts[i].y - first.y;
      const cross = Math.abs(px * dy - py * dx);
      totalDist += cross / len;
    }
    const avgDist = totalDist / (pts.length - 2);
    return avgDist / len;
  }

  _samplePoints(pts, count) {
    if (pts.length <= count) return pts;
    const step = (pts.length - 1) / (count - 1);
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(pts[Math.round(i * step)]);
    }
    return result;
  }

  _computeBBox(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  serializeForAPI(stroke) {
    if (!stroke) return null;
    const { curvature } = stroke;
    let curvatureDesc = curvature.type;
    if (curvature.type === "arc" && stroke.arcFit) {
      const pct = Math.round(Math.abs(stroke.arcFit.arcSpan.span) / (2 * Math.PI) * 100);
      curvatureDesc = `arc (~${pct}% of a circle, r=${Math.round(stroke.arcFit.r)}px)`;
    }

    return {
      start: { x: Math.round(stroke.start.x), y: Math.round(stroke.start.y) },
      end: { x: Math.round(stroke.end.x), y: Math.round(stroke.end.y) },
      direction: {
        dx: +stroke.direction.dx.toFixed(3),
        dy: +stroke.direction.dy.toFixed(3),
        angle: Math.round(stroke.direction.angle),
      },
      curvature: curvatureDesc,
      color: stroke.color,
      size: stroke.size,
      brush: stroke.brush,
      pointCount: stroke.points.length,
    };
  }
}
