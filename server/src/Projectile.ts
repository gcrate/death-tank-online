import { WeaponType, ProjectileState, TerrainDestruction } from '../../shared/protocol';
import { PHYSICS, GAME } from './constants';
import { Terrain } from './Terrain';

export class Projectile {
  id: string;
  type: WeaponType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  active: boolean = true;
  armTime: number = 0;          // For mines
  hasReachedApex: boolean = false;
  isLandedMarker: boolean = false;
  hasLanded: boolean = false;
  age: number = 0;              // Seconds since launch
  maxAge: number = Infinity;    // Time limit before self-detonation
  splitAge: number | null = null; // If set, split at this age regardless of apex

  constructor(
    id: string,
    type: WeaponType,
    x: number,
    y: number,
    angle: number,
    power: number,
    ownerId: string
  ) {
    this.id = id;
    this.type = type;
    this.x = x;
    this.y = y;
    this.ownerId = ownerId;

    // Convert angle (degrees) and power (%) to velocity
    const radians = (angle * Math.PI) / 180;
    const speed = power * 9.2;  // Scale power to velocity
    this.vx = Math.cos(radians) * speed;
    this.vy = Math.sin(radians) * speed;
  }

  update(deltaTime: number, terrain: Terrain): ProjectileUpdateResult {
    if (!this.active) return { hit: false };
    if (this.isLandedMarker) return { hit: false };

    // Age tracking and time-limit detonation
    this.age += deltaTime;
    if (this.age >= this.maxAge) {
      this.active = false;
      return { hit: true, x: this.x, y: this.y, timedOut: true };
    }

    // Special handling for rolling mines
    if (this.type === WeaponType.ROLLING_MINES) {
      return this.updateRollingMine(deltaTime, terrain);
    }

    // Age-based split (e.g. Death's Head clusters after 0.7s)
    if (this.splitAge !== null && this.age >= this.splitAge) {
      this.splitAge = null;  // prevent re-trigger
      return { hit: false, split: true };
    }

    // Apply gravity
    this.vy -= PHYSICS.GRAVITY * deltaTime;

    // Check for apex (MIRV only — Death's Head uses splitAge instead)
    if (this.vy <= 0 && !this.hasReachedApex) {
      this.hasReachedApex = true;
      if (this.type === WeaponType.MIRV) {
        return { hit: false, split: true };
      }
    }

    // Move
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;

    // Check terrain collision — bitmap-based so overhangs work correctly
    if (terrain.isSolid(this.x, this.y)) {
      this.active = false;
      // Death's Head hit before its split time: tiny blast + cluster
      if (this.splitAge !== null) {
        this.splitAge = null;
        return { hit: true, split: true, x: this.x, y: this.y };
      }
      return { hit: true, x: this.x, y: this.y };
    }

    // Check bounds
    if (this.x < 0 || this.x > GAME.CANVAS_WIDTH || this.y < -500) {
      this.active = false;
      return { hit: false, outOfBounds: true };
    }

    return { hit: false };
  }

  private updateRollingMine(deltaTime: number, terrain: Terrain): ProjectileUpdateResult {
    this.armTime += deltaTime;

    if (!this.hasLanded) {
      // In flight — standard arc with gravity
      this.vy -= PHYSICS.GRAVITY * deltaTime;
      this.x += this.vx * deltaTime;
      this.y += this.vy * deltaTime;

      if (terrain.isSolid(this.x, this.y)) {
        // Touch down — snap to surface and start rolling
        this.hasLanded = true;
        this.y = terrain.getHeightAt(this.x);
        this.vy = 0;
        // Discard any uphill component of landing velocity
        const hL = terrain.getHeightAt(this.x - 1);
        const hR = terrain.getHeightAt(this.x + 1);
        if (hR < hL && this.vx < 0) this.vx = 0;  // downhill is right, can't arrive going left
        if (hL < hR && this.vx > 0) this.vx = 0;  // downhill is left, can't arrive going right
      }

      if (this.x < 0 || this.x > GAME.CANVAS_WIDTH || this.y < -500) {
        this.active = false;
        return { hit: false, outOfBounds: true };
      }
    } else {
      // Rolling — compare neighbour heights to find downhill direction unambiguously
      const hL = terrain.getHeightAt(this.x - 1);
      const hR = terrain.getHeightAt(this.x + 1);

      if (hR < hL) {
        // Right is lower → accelerate rightward, prevent leftward movement
        const slopeAngle = Math.atan2(hL - hR, 2);
        this.vx = Math.max(this.vx, 0);
        this.vx += PHYSICS.GRAVITY * Math.sin(slopeAngle) * deltaTime;
      } else if (hL < hR) {
        // Left is lower → accelerate leftward, prevent rightward movement
        const slopeAngle = Math.atan2(hR - hL, 2);
        this.vx = Math.min(this.vx, 0);
        this.vx -= PHYSICS.GRAVITY * Math.sin(slopeAngle) * deltaTime;
      }
      // hL === hR (flat): no gravity, only friction below

      // Friction — bleeds off speed on flat ground until stopped
      this.vx *= (1 - 2 * deltaTime);
      if (Math.abs(this.vx) < 2) this.vx = 0;

      this.x += this.vx * deltaTime;
      this.y = terrain.getHeightAt(this.x);

      if (this.x < 0 || this.x > GAME.CANVAS_WIDTH) {
        this.active = false;
        return { hit: true, x: this.x, y: this.y };
      }
    }

    // Only armed once on the ground; proximity detonation handled in GameEngine
    return { hit: false, isArmed: this.hasLanded && this.armTime > 1 };
  }

  getState(): ProjectileState {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      ownerId: this.ownerId,
    };
  }
}

export interface ProjectileUpdateResult {
  hit: boolean;
  x?: number;
  y?: number;
  split?: boolean;
  outOfBounds?: boolean;
  isArmed?: boolean;
  timedOut?: boolean;
}

// Factory function for split projectiles (MIRV, Death's Head)
export function createSplitProjectiles(
  parent: Projectile,
  count: number,
  coneAngle: number,
  idGenerator: () => string,
  baseAngleDeg?: number  // Override cone direction; defaults to parent velocity direction
): Projectile[] {
  const projectiles: Projectile[] = [];
  const baseAngle = baseAngleDeg !== undefined
    ? baseAngleDeg
    : Math.atan2(parent.vy, parent.vx) * (180 / Math.PI);
  const halfCone = coneAngle / 2;
  const angleStep = count > 1 ? coneAngle / (count - 1) : 0;

  for (let i = 0; i < count; i++) {
    const angle = baseAngle - halfCone + angleStep * i;
    const speed = Math.sqrt(parent.vx ** 2 + parent.vy ** 2) * 0.6;  // Reduced speed for bomblets

    const proj = new Projectile(
      idGenerator(),
      WeaponType.STANDARD,  // Bomblets behave like standard missiles
      parent.x,
      parent.y,
      angle,
      speed / 9.2,  // Convert back to power scale
      parent.ownerId
    );
    proj.hasReachedApex = true;  // Bomblets don't split again
    projectiles.push(proj);
  }

  return projectiles;
}

// Factory function for Corbomite death explosion
export function createCorbomiteProjectiles(
  tankX: number,
  tankY: number,
  ownerId: string,
  idGenerator: () => string
): Projectile[] {
  const projectiles: Projectile[] = [];
  const count = 5;
  const coneAngle = 150;  // 150 degree arc, mostly upward
  const halfCone = coneAngle / 2;
  const angleStep = coneAngle / (count - 1);
  const baseAngle = 90;  // Straight up
  const power = 30;  // Low power

  for (let i = 0; i < count; i++) {
    const angle = baseAngle - halfCone + angleStep * i;
    const proj = new Projectile(
      idGenerator(),
      WeaponType.CORBOMITE_BLAST,
      tankX,
      tankY,
      angle,
      power,
      ownerId
    );
    projectiles.push(proj);
  }

  return projectiles;
}

// Factory function for Air Strike
export function createAirStrikeProjectiles(
  targetX: number,
  ownerId: string,
  idGenerator: () => string
): Projectile[] {
  const projectiles: Projectile[] = [];
  const count = 5;
  const spread = 220;  // Total horizontal spread

  for (let i = 0; i < count; i++) {
    const x = targetX - spread / 2 + (spread / (count - 1)) * i;
    const proj = new Projectile(
      idGenerator(),
      WeaponType.AIR_STRIKE,
      x,
      GAME.CANVAS_HEIGHT + 50,  // Start above screen
      270,  // Straight down
      20,   // Low power, just falling
      ownerId
    );
    projectiles.push(proj);
  }

  return projectiles;
}
