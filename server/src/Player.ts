import WebSocket from 'ws';
import { WeaponType, ItemType, InputState, InventoryState, ServerMessage } from '../../shared/protocol';

export class Player {
  id: string;
  name: string;
  ws: WebSocket;
  ready: boolean = false;
  money: number = 200;
  currentInput: InputState | null = null;

  // Persistent inventory across rounds
  weapons: Map<WeaponType, number> = new Map();  // weapon -> ammo
  items: Set<ItemType> = new Set();
  jumpJetCount: number = 0;
  jetFuel: number = 0;        // 0–1 normalized; persists between rounds

  // Total kills across all rounds (for game over screen)
  totalKills: number = 0;

  constructor(id: string, name: string, ws: WebSocket) {
    this.id = id;
    this.name = name;
    this.ws = ws;
    // Start with standard missile (infinite)
    this.weapons.set(WeaponType.STANDARD, -1);
  }

  send(message: ServerMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch {
        // Ignore send errors
      }
    }
  }

  hasItem(itemType: ItemType): boolean {
    if (itemType === ItemType.JUMP_JETS) return this.jumpJetCount > 0;
    return this.items.has(itemType);
  }

  addWeapon(type: WeaponType, ammo: number): void {
    if (ammo === -1) {
      // Infinite ammo weapons just get set
      this.weapons.set(type, -1);
    } else {
      const current = this.weapons.get(type) || 0;
      const newAmmo = current === -1 ? -1 : current + ammo;
      this.weapons.set(type, newAmmo);
    }
  }

  addItem(type: ItemType): void {
    if (type === ItemType.JUMP_JETS) {
      this.jumpJetCount++;
      // Add one jet's worth of fuel, re-normalized to the new total capacity
      this.jetFuel = (this.jetFuel * (this.jumpJetCount - 1) + 1) / this.jumpJetCount;
    } else {
      this.items.add(type);
    }
  }

  getInventoryState(): InventoryState {
    const weapons: { type: WeaponType; ammo: number }[] = [];
    for (const [type, ammo] of this.weapons) {
      weapons.push({ type, ammo });
    }

    const items: ItemType[] = Array.from(this.items);
    for (let i = 0; i < this.jumpJetCount; i++) items.push(ItemType.JUMP_JETS);

    return {
      weapons,
      items,
    };
  }

  // Reset for next round (keep inventory, reset ready state)
  resetForRound(): void {
    this.ready = false;
    this.currentInput = null;
  }
}
