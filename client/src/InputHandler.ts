import { InputState } from '../../shared/protocol';

export class InputHandler {
  private keys: Set<string> = new Set();
  private gamepadIndex: number | null = null;
  private prevKeys: Set<string> = new Set();

  aimAngle: number = 90;
  power: number = 50;
  selectedWeapon: number = 0;
  weaponCount: number = 1;

  onChatOpen: (() => void) | null = null;

  // Touch state — set by TouchController each frame before update()
  touchLeft     = false;
  touchRight    = false;
  touchAimUp    = false;
  touchAimDown  = false;
  touchPowerUp  = false;
  touchPowerDown= false;
  touchFire     = false;
  touchJump     = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          this.cycleWeaponPrev();
        } else {
          this.cycleWeaponNext();
        }
      }
      if (e.code === 'Enter') {
        this.onChatOpen?.();
      }
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = (e as GamepadEvent).gamepad.index;
    });

    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadIndex = null;
    });
  }

  update(deltaTime: number): InputState {
    // Check gamepad
    const gamepad = this.gamepadIndex !== null ? navigator.getGamepads()[this.gamepadIndex] : null;

    // Movement: Q/E or touch
    let moveDirection: -1 | 0 | 1 = 0;
    if (this.keys.has('KeyQ') || this.touchLeft)  moveDirection = -1;
    if (this.keys.has('KeyE') || this.touchRight) moveDirection = 1;
    if (gamepad) {
      const leftStickX = gamepad.axes[0];
      const dpadLeft = gamepad.buttons[14]?.pressed;
      const dpadRight = gamepad.buttons[15]?.pressed;
      if (leftStickX < -0.3 || dpadLeft) moveDirection = -1;
      if (leftStickX > 0.3 || dpadRight) moveDirection = 1;
    }

    // Aiming: Left/Right arrows or A/D or touch
    const aimSpeed = 90 * deltaTime;  // Degrees per second
    let aimDirection: -1 | 0 | 1 = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.touchAimUp) {
      this.aimAngle = Math.min(200, this.aimAngle + aimSpeed);
      aimDirection = 1;
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.touchAimDown) {
      this.aimAngle = Math.max(-20, this.aimAngle - aimSpeed);
      aimDirection = -1;
    }
    if (gamepad) {
      const rightStickY = gamepad.axes[3];
      const dpadUp = gamepad.buttons[12]?.pressed;
      const dpadDown = gamepad.buttons[13]?.pressed;
      if (dpadUp) { this.aimAngle = Math.min(200, this.aimAngle + aimSpeed); aimDirection = 1; }
      if (dpadDown) { this.aimAngle = Math.max(-20, this.aimAngle - aimSpeed); aimDirection = -1; }
      if (Math.abs(rightStickY) > 0.1) {
        this.aimAngle = Math.max(-20, Math.min(200, this.aimAngle - rightStickY * aimSpeed * 2));
        aimDirection = rightStickY < 0 ? 1 : -1;
      }
    }

    // Power: Up/Down arrows or W/S or touch
    const powerSpeed = 50 * deltaTime;
    const shiftHeld = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.touchPowerUp) {
      this.power = Math.min(100, this.power + powerSpeed);
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.touchPowerDown) {
      this.power = Math.max(10, this.power - powerSpeed);
    }
    if (gamepad) {
      const rt = gamepad.buttons[7]?.value || 0;
      const lt = gamepad.buttons[6]?.value || 0;
      if (rt > 0.1) this.power = Math.min(100, this.power + powerSpeed);
      if (lt > 0.1) this.power = Math.max(10, this.power - powerSpeed);

      // Weapon cycling with LB/RB
      const lb = gamepad.buttons[4]?.pressed;
      const rb = gamepad.buttons[5]?.pressed;
      const prevLB = this.prevKeys.has('LB');
      const prevRB = this.prevKeys.has('RB');
      if (rb && !prevRB) this.cycleWeaponNext();
      if (lb && !prevLB) this.cycleWeaponPrev();
      if (rb) this.prevKeys.add('RB'); else this.prevKeys.delete('RB');
      if (lb) this.prevKeys.add('LB'); else this.prevKeys.delete('LB');
    }

    // Firing
    const firing = this.keys.has('Space') || (gamepad?.buttons[0]?.pressed ?? false) || this.touchFire;

    // Jumping (hold shift, or gamepad B, or touch)
    const jumping = shiftHeld || (gamepad?.buttons[1]?.pressed ?? false) || this.touchJump;

    return {
      moveDirection,
      aimAngle: this.aimAngle,
      aimDirection,
      power: Math.round(this.power),
      firing,
      jumping,
      selectedWeapon: this.selectedWeapon,
    };
  }

  cycleWeaponNext(): void {
    this.selectedWeapon = (this.selectedWeapon + 1) % this.weaponCount;
  }

  cycleWeaponPrev(): void {
    this.selectedWeapon = (this.selectedWeapon - 1 + this.weaponCount) % this.weaponCount;
  }

  setWeaponCount(count: number): void {
    this.weaponCount = Math.max(1, count);
    if (this.selectedWeapon >= this.weaponCount) {
      this.selectedWeapon = 0;
    }
  }
}
