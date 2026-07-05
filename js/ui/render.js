import { TERRAIN } from '../core/terrain.js';
import { isConcealedFrom } from '../core/rules.js';

export const TILE_BASE = 46;

const TERRAIN_COLORS = {
  [TERRAIN.PLAIN]: ['#eafce0', '#c9edb0'],
  [TERRAIN.FOREST]: ['#8fd18a', '#4f9e5a'],
  [TERRAIN.HILL]: ['#e8d3a0', '#cdae6c'],
  [TERRAIN.MOUNTAIN]: ['#c9c3d6', '#8c84a3'],
  [TERRAIN.WATER]: ['#a9e3ff', '#4fa9e0'],
  [TERRAIN.ROAD]: ['#f3ead9', '#dcc9a3'],
};

const OWNER_COLORS = {
  A: ['#9fd4ff', '#3d7fd6'],
  B: ['#ffb3ae', '#d64d47'],
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = { scale: 1, x: 0, y: 0 };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  }

  fitBoard(size) {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const boardPx = size * TILE_BASE;
    const scale = Math.min(rect.width / boardPx, rect.height / boardPx, 1.4);
    this.camera.scale = Math.max(scale, rect.width / boardPx * 0.55);
    this.camera.x = (rect.width - boardPx * this.camera.scale) / 2;
    this.camera.y = (rect.height - boardPx * this.camera.scale) / 2;
  }

  screenToBoard(sx, sy) {
    const { scale, x, y } = this.camera;
    const bx = (sx - x) / scale;
    const by = (sy - y) / scale;
    return { x: Math.floor(bx / TILE_BASE), y: Math.floor(by / TILE_BASE) };
  }

  draw(state, view) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.scale, this.camera.scale);

    this.drawTerrain(state);
    this.drawDeployZones(state, view);
    this.drawHighlights(state, view);
    this.drawSquads(state, view);

    ctx.restore();
  }

  drawTerrain(state) {
    const { ctx } = this;
    const { size, grid } = state;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const terrain = grid[y][x].terrain;
        const [c1, c2] = TERRAIN_COLORS[terrain];
        const px = x * TILE_BASE;
        const py = y * TILE_BASE;
        const grad = ctx.createLinearGradient(px, py, px + TILE_BASE, py + TILE_BASE);
        grad.addColorStop(0, c1);
        grad.addColorStop(1, c2);
        ctx.fillStyle = grad;
        roundRect(ctx, px + 1, py + 1, TILE_BASE - 2, TILE_BASE - 2, 6);
        ctx.fill();
        if (terrain === TERRAIN.MOUNTAIN) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath();
          ctx.moveTo(px + TILE_BASE * 0.5, py + TILE_BASE * 0.18);
          ctx.lineTo(px + TILE_BASE * 0.72, py + TILE_BASE * 0.6);
          ctx.lineTo(px + TILE_BASE * 0.28, py + TILE_BASE * 0.6);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  drawDeployZones(state, view) {
    if (state.phase !== 'deploy') return;
    const { ctx } = this;
    const tiles = view.deployTiles || [];
    ctx.fillStyle = 'rgba(255, 235, 160, 0.35)';
    for (const t of tiles) {
      roundRect(ctx, t.x * TILE_BASE + 1, t.y * TILE_BASE + 1, TILE_BASE - 2, TILE_BASE - 2, 6);
      ctx.fill();
    }
  }

  drawHighlights(state, view) {
    const { ctx } = this;
    if (view.reachable) {
      ctx.fillStyle = 'rgba(80, 170, 255, 0.38)';
      for (const t of view.reachable.values()) {
        const cx = t.x * TILE_BASE + TILE_BASE / 2;
        const cy = t.y * TILE_BASE + TILE_BASE / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, TILE_BASE * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (view.meleeTargets) {
      for (const { target } of view.meleeTargets) {
        drawRing(ctx, target.x, target.y, '#ff5a52', 4);
      }
    }
    if (view.archerTargets) {
      for (const { target } of view.archerTargets) {
        drawRing(ctx, target.x, target.y, '#ffa334', 4, [6, 4]);
      }
    }
    if (view.selected) {
      drawRing(ctx, view.selected.x, view.selected.y, '#ffe14d', 5);
    }
  }

  drawSquads(state, view) {
    const { ctx } = this;
    const viewerId = view.viewerId;
    for (const squad of state.squads) {
      const concealed = isConcealedFrom(state, squad, viewerId);
      const px = squad.x * TILE_BASE + TILE_BASE / 2;
      const py = squad.y * TILE_BASE + TILE_BASE / 2;
      const r = TILE_BASE * 0.36;
      const [c1, c2] = OWNER_COLORS[squad.ownerId];

      ctx.save();
      if (squad.actedThisTurn) ctx.globalAlpha = 0.55;

      // グロー
      ctx.shadowColor = squad.ownerId === 'A' ? 'rgba(61,127,214,0.55)' : 'rgba(214,77,71,0.55)';
      ctx.shadowBlur = 6;

      const grad = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();

      if (squad.isGeneral) {
        ctx.strokeStyle = '#ffd93d';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      ctx.fillStyle = '#fff';
      ctx.font = `${r * 1.05}px "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const icon = concealed ? '?' : squad.stats.icon;
      ctx.fillText(icon, px, py - r * 0.08);

      // 兵数バッジ
      const badgeText = concealed ? '???' : String(squad.count);
      ctx.font = `bold ${r * 0.5}px "Yu Gothic", sans-serif`;
      const badgeW = ctx.measureText(badgeText).width + 8;
      ctx.fillStyle = 'rgba(30,30,40,0.75)';
      roundRect(ctx, px - badgeW / 2, py + r * 0.55, badgeW, r * 0.68, r * 0.34);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(badgeText, px, py + r * 0.55 + r * 0.35);

      ctx.restore();
    }
  }
}

function drawRing(ctx, x, y, color, width, dash) {
  const px = x * TILE_BASE + TILE_BASE / 2;
  const py = y * TILE_BASE + TILE_BASE / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.arc(px, py, TILE_BASE * 0.44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
