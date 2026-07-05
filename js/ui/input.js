// キャンバスのタップ/ドラッグ(パン)/ピンチズームを扱う軽量入力ハンドラ

export class InputController {
  constructor(canvas, renderer, { onTap }) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.onTap = onTap;
    this.pointers = new Map();
    this.dragMoved = false;
    this.lastPinchDist = null;
    this.lastMid = null;

    canvas.addEventListener('pointerdown', this.onDown.bind(this));
    window.addEventListener('pointermove', this.onMove.bind(this));
    window.addEventListener('pointerup', this.onUp.bind(this));
    window.addEventListener('pointercancel', this.onUp.bind(this));
  }

  onDown(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    this.dragMoved = false;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.lastPinchDist = dist(a, b);
      this.lastMid = mid(a, b);
    }
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = dist(a, b);
      const m = mid(a, b);
      if (this.lastPinchDist) {
        const scaleDelta = d / this.lastPinchDist;
        this.applyZoom(scaleDelta, m);
      }
      this.lastPinchDist = d;
      this.lastMid = m;
      this.dragMoved = true;
    } else if (this.pointers.size === 1) {
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      if (Math.abs(dx) + Math.abs(dy) > 6) {
        this.dragMoved = true;
        const rect = this.canvas.getBoundingClientRect();
        this.renderer.camera.x += e.movementX || 0;
        this.renderer.camera.y += e.movementY || 0;
      }
    }
  }

  applyZoom(scaleDelta, screenMid) {
    const cam = this.renderer.camera;
    const rect = this.canvas.getBoundingClientRect();
    const localX = screenMid.x - rect.left;
    const localY = screenMid.y - rect.top;
    const boardX = (localX - cam.x) / cam.scale;
    const boardY = (localY - cam.y) / cam.scale;
    let newScale = cam.scale * scaleDelta;
    newScale = Math.max(0.25, Math.min(2.5, newScale));
    cam.x = localX - boardX * newScale;
    cam.y = localY - boardY * newScale;
    cam.scale = newScale;
  }

  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    if (p && !this.dragMoved && this.pointers.size <= 1) {
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const board = this.renderer.screenToBoard(sx, sy);
      this.onTap(board.x, board.y);
    }
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.lastPinchDist = null;
    }
  }
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
