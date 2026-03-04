import { InputHandler } from './InputHandler';

interface TouchZone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  active: boolean;
}

const ZONES: Omit<TouchZone, 'active'>[] = [
  // Left side — movement
  { id: 'left',    x: 10,   y: 578, w: 112, h: 132, label: '◄ MOVE' },
  { id: 'right',   x: 130,  y: 578, w: 112, h: 132, label: 'MOVE ►' },

  // Right side — weapon cycle (top row)
  { id: 'wpnprev', x: 1005, y: 498, w: 83,  h: 52,  label: '◄ WPN'  },
  { id: 'wpnnext', x: 1095, y: 498, w: 83,  h: 52,  label: 'WPN ►'  },

  // Right side — aim column
  { id: 'aimup',   x: 1005, y: 556, w: 83,  h: 64,  label: '← AIM'  },
  { id: 'aimdown', x: 1005, y: 627, w: 83,  h: 83,  label: 'AIM →'  },

  // Right side — power column
  { id: 'pwrup',   x: 1095, y: 556, w: 83,  h: 64,  label: 'PWR +'  },
  { id: 'pwrdown', x: 1095, y: 627, w: 83,  h: 83,  label: 'PWR -'  },

  // Right side — jump / fire
  { id: 'jump',    x: 1185, y: 556, w: 90,  h: 64,  label: 'JUMP'   },
  { id: 'fire',    x: 1185, y: 627, w: 90,  h: 83,  label: 'FIRE'   },
];

export class TouchController {
  private enabled: boolean;
  private input: InputHandler;
  private canvas: HTMLCanvasElement;

  private zones: TouchZone[];
  // Maps touch identifier → zone id currently owned by that finger
  private activeTouches: Map<number, string> = new Map();

  constructor(canvas: HTMLCanvasElement, input: InputHandler) {
    this.canvas = canvas;
    this.input  = input;
    this.enabled = localStorage.getItem('touchControlsEnabled') === 'true';
    this.zones   = ZONES.map(z => ({ ...z, active: false }));
    this.setupListeners();
  }

  isEnabled(): boolean { return this.enabled; }

  setEnabled(value: boolean): void {
    this.enabled = value;
    localStorage.setItem('touchControlsEnabled', value ? 'true' : 'false');
    if (!value) {
      // Reset all state so nothing is stuck
      for (const z of this.zones) z.active = false;
      this.activeTouches.clear();
      this.syncFlags();
    }
  }

  // Call once per frame before InputHandler.update() while playing
  updateInputState(): void {
    if (!this.enabled) return;
    this.syncFlags();
  }

  private syncFlags(): void {
    this.input.touchLeft      = this.zoneActive('left');
    this.input.touchRight     = this.zoneActive('right');
    this.input.touchAimUp     = this.zoneActive('aimup');
    this.input.touchAimDown   = this.zoneActive('aimdown');
    this.input.touchPowerUp   = this.zoneActive('pwrup');
    this.input.touchPowerDown = this.zoneActive('pwrdown');
    this.input.touchFire      = this.zoneActive('fire');
    this.input.touchJump      = this.zoneActive('jump');
  }

  private zoneActive(id: string): boolean {
    return this.zones.find(z => z.id === id)?.active ?? false;
  }

  // Draw the overlay — call inside beginFrame/endFrame during playing phase
  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.enabled) return;
    ctx.save();

    for (const zone of this.zones) {
      const isFire = zone.id === 'fire';
      const isJump = zone.id === 'jump';

      const fillAlpha   = zone.active ? 0.65 : 0.30;
      const strokeAlpha = zone.active ? 0.90 : 0.50;
      const labelAlpha  = zone.active ? 1.00 : 0.75;

      let fillColor  = '#112233';
      let strokeColor= '#00ffff';
      if (isFire) { fillColor = '#330800'; strokeColor = '#ff4400'; }
      if (isJump) { fillColor = '#001133'; strokeColor = '#4488ff'; }

      ctx.globalAlpha = fillAlpha;
      ctx.fillStyle = fillColor;
      roundRect(ctx, zone.x, zone.y, zone.w, zone.h, 10);
      ctx.fill();

      ctx.globalAlpha = strokeAlpha;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      roundRect(ctx, zone.x, zone.y, zone.w, zone.h, 10);
      ctx.stroke();

      ctx.globalAlpha = labelAlpha;
      ctx.fillStyle = isFire ? '#ff8844' : isJump ? '#88ccff' : '#ffffff';
      ctx.font = 'bold 14px "Courier New", monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zone.label, zone.x + zone.w / 2, zone.y + zone.h / 2);
    }

    ctx.restore();
  }

  private setupListeners(): void {
    const onStart = (e: TouchEvent) => {
      if (!this.enabled) return;
      for (const t of Array.from(e.changedTouches)) {
        const { cx, cy } = this.toCanvas(t);
        const zone = this.hitZone(cx, cy);
        if (!zone) continue;
        e.preventDefault();
        this.activeTouches.set(t.identifier, zone.id);
        zone.active = true;
        this.onZoneDown(zone.id);
      }
    };

    const onMove = (e: TouchEvent) => {
      if (!this.enabled) return;
      for (const t of Array.from(e.changedTouches)) {
        const prevId = this.activeTouches.get(t.identifier);
        const { cx, cy } = this.toCanvas(t);
        const newZone = this.hitZone(cx, cy);

        if (prevId !== newZone?.id) {
          if (prevId) {
            const old = this.zones.find(z => z.id === prevId);
            if (old) old.active = false;
          }
          if (newZone) {
            e.preventDefault();
            this.activeTouches.set(t.identifier, newZone.id);
            newZone.active = true;
            this.onZoneDown(newZone.id);
          } else {
            this.activeTouches.delete(t.identifier);
          }
        } else if (newZone) {
          e.preventDefault(); // finger still on a zone
        }
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!this.enabled) return;
      for (const t of Array.from(e.changedTouches)) {
        const zoneId = this.activeTouches.get(t.identifier);
        if (!zoneId) continue;
        e.preventDefault();
        const zone = this.zones.find(z => z.id === zoneId);
        if (zone) zone.active = false;
        this.activeTouches.delete(t.identifier);
      }
    };

    // Use document so events reach us regardless of what overlay element is on top
    document.addEventListener('touchstart',  onStart, { passive: false });
    document.addEventListener('touchmove',   onMove,  { passive: false });
    document.addEventListener('touchend',    onEnd,   { passive: false });
    document.addEventListener('touchcancel', onEnd,   { passive: false });
  }

  private toCanvas(touch: Touch): { cx: number; cy: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      cx: (touch.clientX - rect.left) * (1280 / rect.width),
      cy: (touch.clientY - rect.top)  * (720  / rect.height),
    };
  }

  private hitZone(cx: number, cy: number): TouchZone | null {
    for (const z of this.zones) {
      if (cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h) return z;
    }
    return null;
  }

  // Fired exactly once when a finger first lands on a zone
  private onZoneDown(id: string): void {
    if (id === 'wpnprev') this.input.cycleWeaponPrev();
    if (id === 'wpnnext') this.input.cycleWeaponNext();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}
