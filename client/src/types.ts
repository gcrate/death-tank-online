// Client-side types
import { WeaponType } from '../../shared/protocol';

export interface ActiveExplosion {
  x: number;
  y: number;
  radius: number;
  startTime: number;
  duration: number;
}

export interface KillFeedEntry {
  text: string;
  timestamp: number;
}
