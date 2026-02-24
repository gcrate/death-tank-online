import { WeaponType, InputState, GameState, TankState, ProjectileState, TerrainDestruction, ExplosionEvent } from '../../shared/protocol';
import { GAME, PHYSICS } from './constants';
import { WEAPONS } from './Weapon';
import { Terrain } from './Terrain';
import { Tank } from './Tank';
import { Projectile, createSplitProjectiles, createCorbomiteProjectiles, createAirStrikeProjectiles } from './Projectile';

export type GameEvent =
  | { type: 'FIRE'; playerId: string; weapon: WeaponType }
  | { type: 'DEATH'; playerId: string; killedBy: string | null }
  | { type: 'CORBOMITE'; playerId: string }
  | { type: 'ROUND_END'; winnerId: string | null };

export interface GameUpdateResult {
  events: GameEvent[];
  terrainDestructions?: TerrainDestruction[];
  explosions?: ExplosionEvent[];
}

export class GameEngine {
  terrain: Terrain;
  tanks: Map<string, Tank> = new Map();
  projectiles: Map<string, Projectile> = new Map();
  roundTime: number = 0;
  isBlitz: boolean = false;
  roundActive: boolean = false;
  projectileIdCounter: number = 0;
  lastDamageDealer: Map<string, string> = new Map();  // victimId -> lastAttackerId
  pendingAirStrikes: { x: number; ownerId: string; timer: number; markerId: string }[] = [];
  roundEndCountdown: number = -1;

  constructor(terrain: Terrain) {
    this.terrain = terrain;
  }

  generateProjectileId(): string {
    return `proj_${++this.projectileIdCounter}`;
  }

  startRound(isBlitz: boolean): void {
    this.isBlitz = isBlitz;
    this.roundTime = 0;
    this.roundActive = true;
    this.projectiles.clear();
    this.lastDamageDealer.clear();
    this.pendingAirStrikes = [];
    this.roundEndCountdown = -1;
  }

  update(deltaTime: number, inputs: Map<string, InputState>): GameUpdateResult {
    if (!this.roundActive) return { events: [] };

    this.roundTime += deltaTime;
    const events: GameEvent[] = [];

    // Capture aim angles before updating tanks so missile steering can read the delta
    const oldAimAngles = new Map<string, number>();
    for (const [id, tank] of this.tanks) {
      oldAimAngles.set(id, tank.aimAngle);
    }

    // Update tanks
    for (const [playerId, tank] of this.tanks) {
      if (!tank.alive) continue;

      const input = inputs.get(playerId);
      if (input) {
        tank.move(input.moveDirection, this.terrain, deltaTime);
        tank.aimAngle = input.aimAngle;
        tank.power = input.power;
        tank.applyPhysics(deltaTime, input.jumping, this.terrain);

        // Weapon switching
        if (input.selectedWeapon !== tank.currentWeaponIndex) {
          tank.switchWeapon(input.selectedWeapon);
        }

        // Charging
        tank.updateCharge(deltaTime, this.isBlitz);

        // Firing
        if (input.firing) {
          const fireResult = tank.fire();
          if (fireResult) {
            this.createProjectile(tank, fireResult.weapon);
            events.push({ type: 'FIRE', playerId, weapon: fireResult.weapon });
          }
        }
      } else {
        // Still apply physics for tanks without input
        tank.applyPhysics(deltaTime, false, this.terrain);
        tank.updateCharge(deltaTime, this.isBlitz);
      }

    }

    // Update projectiles
    const terrainDestructions: TerrainDestruction[] = [];
    const explosions: ExplosionEvent[] = [];
    const toDelete: string[] = [];
    const toAdd: Projectile[] = [];

    for (const [id, projectile] of this.projectiles) {
      // Steer guided missiles using the owner's A/D aim-angle change
      if (projectile.type === WeaponType.MISSILES) {
        const ownerTank = this.tanks.get(projectile.ownerId);
        const oldAim = oldAimAngles.get(projectile.ownerId);
        if (ownerTank && oldAim !== undefined) {
          // aimAngle increases when pressing A (toward left=180°), decreases for D (toward right=0°)
          // A positive delta means the player aimed left → turn missile left (increase velocity angle)
          const aimDelta = ownerTank.aimAngle - oldAim;
          if (aimDelta !== 0) {
            const speed = Math.sqrt(projectile.vx ** 2 + projectile.vy ** 2);
            const currentAngle = Math.atan2(projectile.vy, projectile.vx);
            const newAngle = currentAngle + aimDelta * (Math.PI / 180);
            projectile.vx = Math.cos(newAngle) * speed;
            projectile.vy = Math.sin(newAngle) * speed;
          }
        }
      }

      let result = projectile.update(deltaTime, this.terrain);

      // Direct tank hit check
      if (!result.hit && !result.split && !result.outOfBounds) {
        for (const [tankId, tank] of this.tanks) {
          if (!tank.alive || tankId === projectile.ownerId) continue;
          const dx = tank.x - projectile.x;
          const dy = tank.y - projectile.y;
          if (Math.sqrt(dx * dx + dy * dy) < 16) {
            result = { hit: true, x: projectile.x, y: projectile.y };
            break;
          }
        }
      }

      if (result.split) {
        // Handle MIRV / Death's Head split
        const weapon = projectile.type;
        let count = 5;
        let cone = 60;

        if (weapon === WeaponType.DEATHS_HEAD) {
          count = 30;
          cone = 120;
        }

        const bomblets = createSplitProjectiles(
          projectile,
          count,
          cone,
          () => this.generateProjectileId()
        );

        toAdd.push(...bomblets);
        toDelete.push(id);
        continue;
      }

      if (result.hit && result.x !== undefined && result.y !== undefined) {
        if (projectile.type === WeaponType.AIR_STRIKE_MARKER) {
          // Drop a static landed marker, then schedule bombs after a delay
          const markerId = this.generateProjectileId();
          const landed = new Projectile(markerId, WeaponType.AIR_STRIKE_MARKER, result.x, result.y, 0, 0, projectile.ownerId);
          landed.isLandedMarker = true;
          toAdd.push(landed);
          this.pendingAirStrikes.push({ x: result.x, ownerId: projectile.ownerId, timer: 1.5, markerId });
          toDelete.push(id);
          continue;
        }

        const weaponDef = WEAPONS[projectile.type] || WEAPONS[WeaponType.STANDARD];

        // Create explosion
        const explosion: ExplosionEvent = {
          x: result.x,
          y: result.y,
          radius: weaponDef.blastRadius,
          damage: weaponDef.damage,
          ownerId: projectile.ownerId,
          weaponType: projectile.type,
        };
        explosions.push(explosion);

        // Destroy terrain (machine gun leaves no craters)
        if (projectile.type !== WeaponType.MACHINE_GUN) {
          const destruction = this.terrain.destroy(result.x, result.y, weaponDef.blastRadius);
          terrainDestructions.push(destruction);
        }

        // Damage tanks
        for (const [tankId, tank] of this.tanks) {
          if (!tank.alive) continue;

          const distance = Math.sqrt((tank.x - result.x) ** 2 + (tank.y - result.y) ** 2);
          if (distance < weaponDef.blastRadius) {
            // Damage falls off with distance
            const falloff = 1 - (distance / weaponDef.blastRadius);
            const damage = Math.floor(weaponDef.damage * falloff);

            if (damage > 0) {
              this.lastDamageDealer.set(tankId, projectile.ownerId);
              const damageResult = tank.takeDamage(damage, this.roundTime);

              if (damageResult.dead) {
                const killedBy = projectile.ownerId === tankId ? null : projectile.ownerId;
                events.push({
                  type: 'DEATH',
                  playerId: tankId,
                  killedBy,
                });

                // Handle Corbomite
                if (tank.hasCorbomite) {
                  const corbomiteProjectiles = createCorbomiteProjectiles(
                    tank.x,
                    tank.y,
                    tankId,
                    () => this.generateProjectileId()
                  );
                  toAdd.push(...corbomiteProjectiles);
                  events.push({ type: 'CORBOMITE', playerId: tankId });
                }
              }
            }
          }
        }

        toDelete.push(id);
      } else if (result.outOfBounds) {
        toDelete.push(id);
      }

      // Rolling mine proximity check
      if (result.isArmed && projectile.type === WeaponType.ROLLING_MINES) {
        const mineWeaponDef = WEAPONS[WeaponType.ROLLING_MINES];
        for (const [tankId, tank] of this.tanks) {
          if (!tank.alive) continue;

          const distance = Math.sqrt((tank.x - projectile.x) ** 2 + (tank.y - projectile.y) ** 2);
          if (distance < 25) {  // Tight trigger — mine must nearly touch before detonating
            // Trigger mine explosion
            projectile.active = false;
            const weaponDef = WEAPONS[WeaponType.ROLLING_MINES];
            explosions.push({
              x: projectile.x,
              y: projectile.y,
              radius: weaponDef.blastRadius,
              damage: weaponDef.damage,
              ownerId: projectile.ownerId,
              weaponType: WeaponType.ROLLING_MINES,
            });
            terrainDestructions.push(this.terrain.destroy(projectile.x, projectile.y, weaponDef.blastRadius));

            // Damage nearby tanks
            for (const [tid, t] of this.tanks) {
              if (!t.alive) continue;
              const d = Math.sqrt((t.x - projectile.x) ** 2 + (t.y - projectile.y) ** 2);
              if (d < weaponDef.blastRadius) {
                const falloff = 1 - d / weaponDef.blastRadius;
                const dmg = Math.floor(weaponDef.damage * falloff);
                if (dmg > 0) {
                  const dr = t.takeDamage(dmg, this.roundTime);
                  if (dr.dead) {
                    events.push({ type: 'DEATH', playerId: tid, killedBy: projectile.ownerId });
                    if (t.hasCorbomite) {
                      toAdd.push(...createCorbomiteProjectiles(t.x, t.y, tid, () => this.generateProjectileId()));
                      events.push({ type: 'CORBOMITE', playerId: tid });
                    }
                  }
                }
              }
            }

            toDelete.push(id);
          }
        }
      }

      if (!projectile.active && !toDelete.includes(id)) {
        toDelete.push(id);
      }
    }

    // Apply deferred changes
    for (const id of toDelete) {
      this.projectiles.delete(id);
    }
    for (const proj of toAdd) {
      this.projectiles.set(proj.id, proj);
    }

    // Process pending air strikes
    for (let i = this.pendingAirStrikes.length - 1; i >= 0; i--) {
      const pending = this.pendingAirStrikes[i];
      pending.timer -= deltaTime;
      if (pending.timer <= 0) {
        this.projectiles.delete(pending.markerId);
        const drops = createAirStrikeProjectiles(pending.x, pending.ownerId, () => this.generateProjectileId());
        for (const drop of drops) {
          this.projectiles.set(drop.id, drop);
        }
        this.pendingAirStrikes.splice(i, 1);
      }
    }

    // World leveling
    if (this.roundTime >= GAME.WORLD_LEVELING_START) {
      const levelingPhase = this.roundTime - GAME.WORLD_LEVELING_START;

      if (levelingPhase > 0) {
        // Gradually flatten terrain
        const flattenRate = 5 * deltaTime;  // Pixels per tick
        this.terrain.flatten(flattenRate);

        // Random explosions during phase 2 (15-25 seconds in)
        if (levelingPhase > 30 && levelingPhase < 40 && Math.random() < 0.1) {
          const randomX = Math.random() * GAME.CANVAS_WIDTH;
          const randomY = this.terrain.getHeightAt(randomX) + Math.random() * 100;
          const explosion: ExplosionEvent = {
            x: randomX,
            y: randomY,
            radius: 40,
            damage: 20,
            ownerId: 'world',
            weaponType: WeaponType.STANDARD,
          };
          explosions.push(explosion);
          terrainDestructions.push(this.terrain.destroy(randomX, randomY, 40));

          // Damage tanks near world explosions
          for (const [tankId, tank] of this.tanks) {
            if (!tank.alive) continue;
            const d = Math.sqrt((tank.x - randomX) ** 2 + (tank.y - randomY) ** 2);
            if (d < 40) {
              const falloff = 1 - d / 40;
              const dmg = Math.floor(20 * falloff);
              if (dmg > 0) {
                const dr = tank.takeDamage(dmg, this.roundTime);
                if (dr.dead) {
                  events.push({ type: 'DEATH', playerId: tankId, killedBy: null });
                }
              }
            }
          }
        }

        // Sudden death at 90 seconds
        if (this.roundTime >= GAME.ROUND_TIME_LIMIT) {
          for (const [tankId, tank] of this.tanks) {
            if (tank.alive) {
              const damageResult = tank.takeDamage(10 * deltaTime, this.roundTime);
              if (damageResult.dead) {
                events.push({ type: 'DEATH', playerId: tankId, killedBy: null });
              }
            }
          }
        }
      }
    }

    // Check for round end
    const aliveTanks = Array.from(this.tanks.values()).filter(t => t.alive);
    if (aliveTanks.length <= 1 && this.roundActive && this.roundEndCountdown < 0) {
      this.roundEndCountdown = 5.0;
    }

    if (this.roundEndCountdown >= 0) {
      this.roundEndCountdown -= deltaTime;
      if (this.roundEndCountdown <= 0) {
        this.roundEndCountdown = -1;
        this.roundActive = false;
        const finalAlive = Array.from(this.tanks.values()).filter(t => t.alive);
        events.push({
          type: 'ROUND_END',
          winnerId: finalAlive.length === 1 ? finalAlive[0].id : null,
        });
      }
    }

    return {
      events,
      terrainDestructions,
      explosions,
    };
  }

  createProjectile(tank: Tank, weapon: WeaponType): Projectile | null {
    // Air strike fires a marker that flies to target, then bombs fall from sky
    if (weapon === WeaponType.AIR_STRIKE) {
      const marker = new Projectile(
        this.generateProjectileId(),
        WeaponType.AIR_STRIKE_MARKER,
        tank.x,
        tank.y + 10,
        tank.aimAngle,
        tank.power,
        tank.id
      );
      this.projectiles.set(marker.id, marker);
      return marker;
    }

    const projectile = new Projectile(
      this.generateProjectileId(),
      weapon,
      tank.x,
      tank.y + 10,  // Spawn slightly above tank
      tank.aimAngle,
      tank.power,
      tank.id
    );

    // Guided missiles have a 2-second flight limit
    if (weapon === WeaponType.MISSILES) {
      projectile.maxAge = 2.0;
    }

    this.projectiles.set(projectile.id, projectile);
    return projectile;
  }

  getState(): GameState {
    const tanks: { [playerId: string]: TankState } = {};
    for (const [id, tank] of this.tanks) {
      tanks[id] = tank.getState();
    }

    const projectiles: ProjectileState[] = [];
    for (const [, proj] of this.projectiles) {
      projectiles.push(proj.getState());
    }

    return {
      tick: 0,  // Set by Room
      serverTime: Date.now(),
      roundTime: this.roundTime,
      tanks,
      projectiles,
    };
  }
}
