interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;         // 0-1, decreasing
  maxLife: number;
  r: number;
  g: number;
  b: number;
  size: number;
  gravity: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];

  emit(x: number, y: number, options: {
    count: number;
    speed?: number;
    speedVariance?: number;
    r?: number;
    g?: number;
    b?: number;
    rVariance?: number;
    gVariance?: number;
    bVariance?: number;
    life?: number;
    lifeVariance?: number;
    size?: number;
    sizeVariance?: number;
    gravity?: number;
    directionBias?: number;  // angle in radians
    spread?: number;          // cone spread in radians
  }): void {
    const {
      count,
      speed = 80,
      speedVariance = 40,
      r = 255, g = 150, b = 50,
      rVariance = 0, gVariance = 50, bVariance = 50,
      life = 0.8,
      lifeVariance = 0.3,
      size = 3,
      sizeVariance = 2,
      gravity = 200,
      directionBias,
      spread = Math.PI * 2,
    } = options;

    for (let i = 0; i < count; i++) {
      const angle = directionBias !== undefined
        ? directionBias + (Math.random() - 0.5) * spread
        : Math.random() * Math.PI * 2;

      const spd = speed + (Math.random() - 0.5) * speedVariance * 2;
      const maxLife = life + (Math.random() - 0.5) * lifeVariance * 2;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: -Math.sin(angle) * spd,  // Canvas Y is inverted
        life: maxLife,
        maxLife,
        r: Math.min(255, Math.max(0, r + (Math.random() - 0.5) * rVariance * 2)),
        g: Math.min(255, Math.max(0, g + (Math.random() - 0.5) * gVariance * 2)),
        b: Math.min(255, Math.max(0, b + (Math.random() - 0.5) * bVariance * 2)),
        size: Math.max(0.5, size + (Math.random() - 0.5) * sizeVariance * 2),
        gravity,
      });
    }
  }

  emitExplosion(x: number, y: number, radius: number): void {
    // Fire core
    this.emit(x, y, {
      count: Math.floor(radius * 0.8),
      speed: radius * 2,
      speedVariance: radius,
      r: 255, g: 200, b: 50,
      gVariance: 100, bVariance: 50,
      life: 0.6,
      lifeVariance: 0.2,
      size: 4,
      sizeVariance: 3,
    });

    // Smoke
    this.emit(x, y, {
      count: Math.floor(radius * 0.3),
      speed: radius * 0.8,
      speedVariance: radius * 0.5,
      r: 80, g: 80, b: 80,
      rVariance: 40, gVariance: 40, bVariance: 40,
      life: 1.5,
      lifeVariance: 0.5,
      size: 6,
      sizeVariance: 4,
      gravity: 30,
    });

    // Debris
    this.emit(x, y, {
      count: Math.floor(radius * 0.4),
      speed: radius * 1.5,
      speedVariance: radius * 0.8,
      r: 100, g: 60, b: 20,
      life: 1.0,
      lifeVariance: 0.4,
      size: 2,
      sizeVariance: 1.5,
      gravity: 400,
    });
  }

  emitSmokeTrail(x: number, y: number): void {
    // Short-lived puff visible during flight
    this.emit(x, y, {
      count: 1,
      speed: 8,
      speedVariance: 6,
      r: 220, g: 220, b: 220,
      rVariance: 30, gVariance: 30, bVariance: 30,
      life: 2.5,
      lifeVariance: 0.5,
      size: 3,
      sizeVariance: 1.5,
      gravity: -15,
    });
    // Persistent faint dot — marks the arc for 20 seconds
    this.emit(x, y, {
      count: 1,
      speed: 1,
      speedVariance: 1,
      r: 255, g: 255, b: 255,
      rVariance: 0, gVariance: 0, bVariance: 0,
      life: 20,
      lifeVariance: 2,
      size: 2,
      sizeVariance: 0.5,
      gravity: 0,
    });
  }

  emitJetTrail(x: number, y: number): void {
    this.emit(x, y, {
      count: 2,
      speed: 20,
      speedVariance: 30,
      r: 50, g: 150, b: 255,
      gVariance: 50, bVariance: 50,
      life: 0.3,
      lifeVariance: 0.1,
      size: 3,
      sizeVariance: 2,
      directionBias: Math.PI / 2,  // Downward bias (canvas)
      spread: Math.PI / 3,
      gravity: 0,
    });
  }

  update(deltaTime: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= deltaTime;
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.vy += p.gravity * deltaTime;  // Gravity (canvas Y increases downward)

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${Math.round(p.r)},${Math.round(p.g)},${Math.round(p.b)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.particles = [];
  }
}
