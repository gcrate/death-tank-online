import { TERRAIN, GAME } from './constants';
import { TerrainDestruction } from '../../shared/protocol';

const CH = GAME.CANVAS_HEIGHT;  // 720 — height of the playfield

export class Terrain {
  heightmap: Float32Array;       // kept for initial-state transmission only
  bitmap: Uint8Array;            // [x * CH + y] — 1 = solid, 0 = empty
  width: number;

  private flattenAccum: Float32Array;

  constructor(width: number, _type: string = 'mountainous') {
    this.width = width;
    this.heightmap = new Float32Array(width);
    this.bitmap = new Uint8Array(width * CH);
    this.flattenAccum = new Float32Array(width);
    this.generate();
  }

  generate(): void {
    const minH = TERRAIN.MIN_HEIGHT;
    const maxH = TERRAIN.MAX_HEIGHT;
    const range = maxH - minH;

    this.heightmap.fill(minH);

    const numPeaks = 6 + Math.floor(Math.random() * 5);
    for (let p = 0; p < numPeaks; p++) {
      const cx = Math.random() * this.width;
      const peakH = minH + range * (0.35 + Math.random() * 0.45);
      const spread = 30 + Math.random() * 100;

      for (let x = 0; x < this.width; x++) {
        const dx = x - cx;
        const contribution = (peakH - minH) * Math.exp(-(dx * dx) / (2 * spread * spread));
        this.heightmap[x] = Math.min(maxH, this.heightmap[x] + contribution);
      }
    }

    this.smooth(2);

    // Fill bitmap from heightmap — solid below the surface line
    this.bitmap.fill(0);
    for (let x = 0; x < this.width; x++) {
      const h = Math.floor(this.heightmap[x]);
      const base = x * CH;
      for (let y = 0; y <= h; y++) {
        this.bitmap[base + y] = 1;
      }
    }
  }

  smooth(passes: number): void {
    for (let p = 0; p < passes; p++) {
      for (let i = 1; i < this.width - 1; i++) {
        this.heightmap[i] = (this.heightmap[i - 1] + this.heightmap[i] * 2 + this.heightmap[i + 1]) / 4;
      }
    }
  }

  isSolid(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= CH) return false;
    return this.bitmap[ix * CH + iy] === 1;
  }

  getHeightAt(x: number): number {
    const ix = Math.floor(Math.max(0, Math.min(this.width - 1, x)));
    const base = ix * CH;
    for (let y = CH - 1; y >= 0; y--) {
      if (this.bitmap[base + y] === 1) return y;
    }
    return 0;
  }

  getSlopeAt(x: number): number {
    const left = this.getHeightAt(x - 1);
    const right = this.getHeightAt(x + 1);
    return Math.atan2(right - left, 2);
  }

  destroy(centerX: number, centerY: number, radius: number): TerrainDestruction {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(centerX - radius));
    const x1 = Math.min(this.width - 1, Math.ceil(centerX + radius));
    const y0 = Math.max(TERRAIN.FLOOR_HEIGHT, Math.floor(centerY - radius));
    const y1 = Math.min(CH - 1, Math.ceil(centerY + radius));

    for (let x = x0; x <= x1; x++) {
      const base = x * CH;
      const dx = x - centerX;
      for (let y = y0; y <= y1; y++) {
        const dy = y - centerY;
        if (dx * dx + dy * dy <= r2) {
          this.bitmap[base + y] = 0;
        }
      }
    }

    // Settle columns in blast area + margin so overhangs collapse
    const sx0 = Math.max(0, x0 - 20);
    const sx1 = Math.min(this.width - 1, x1 + 20);
    for (let x = sx0; x <= sx1; x++) {
      this.settleColumn(x);
    }

    return { x: centerX, y: centerY, radius };
  }

  private settleColumn(x: number): void {
    const base = x * CH;
    const MIN_GAP = 10;

    let changed = true;
    while (changed) {
      changed = false;

      // Collect solid segments bottom-to-top
      const segs: { bottom: number; top: number }[] = [];
      let inSolid = false;
      let segStart = 0;
      for (let y = 0; y < CH; y++) {
        const solid = this.bitmap[base + y] === 1;
        if (solid && !inSolid)       { segStart = y; inSolid = true; }
        else if (!solid && inSolid)  { segs.push({ bottom: segStart, top: y - 1 }); inSolid = false; }
      }
      if (inSolid) segs.push({ bottom: segStart, top: CH - 1 });

      // Drop any floating segment whose gap below is >= MIN_GAP
      for (let i = 1; i < segs.length; i++) {
        const below = segs[i - 1];
        const seg   = segs[i];
        const gap   = seg.bottom - (below.top + 1);
        if (gap >= MIN_GAP) {
          const height    = seg.top - seg.bottom;
          const newBottom = below.top + 1;
          const newTop    = newBottom + height;
          for (let y = seg.bottom; y <= seg.top; y++)               this.bitmap[base + y] = 0;
          for (let y = newBottom; y <= Math.min(newTop, CH - 1); y++) this.bitmap[base + y] = 1;
          changed = true;
          break; // restart after any move
        }
      }
    }
  }

  flatten(amount: number): void {
    for (let x = 0; x < this.width; x++) {
      this.flattenAccum[x] += amount;
      const pixels = Math.floor(this.flattenAccum[x]);
      if (pixels <= 0) continue;
      this.flattenAccum[x] -= pixels;

      const base = x * CH;
      let removed = 0;
      for (let y = CH - 1; y >= TERRAIN.FLOOR_HEIGHT && removed < pixels; y--) {
        if (this.bitmap[base + y] === 1) {
          this.bitmap[base + y] = 0;
          removed++;
        }
      }
    }
  }
}
