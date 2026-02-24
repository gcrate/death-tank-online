import { RoundEarnings } from '../../shared/protocol';
import { ECONOMY } from './constants';

export function calculateRoundEarnings(
  playerId: string,
  kills: string[],              // Array of player IDs killed by this player
  leaderId: string | null,      // Current match leader ID
  survived: boolean,
  totalPlayers: number,
  allKilledByPlayer: boolean    // Did this player kill everyone?
): RoundEarnings {
  let killReward = 0;
  let leaderKills = 0;
  let leaderKillReward = 0;

  for (const victimId of kills) {
    if (victimId === leaderId) {
      leaderKills++;
      leaderKillReward += ECONOMY.LEADER_KILL_REWARD;
    } else {
      killReward += ECONOMY.KILL_REWARD;
    }
  }

  const survivalBonus = survived ? ECONOMY.SURVIVAL_BONUS : 0;
  const participationBonus = kills.length === 0 && !survived ? ECONOMY.PARTICIPATION_BONUS : 0;

  const subtotal = killReward + leaderKillReward + survivalBonus + participationBonus;

  // Groovy bonus: +50% if killed all other players
  let groovyBonus = 0;
  if (allKilledByPlayer && kills.length === totalPlayers - 1) {
    groovyBonus = Math.floor(subtotal * (ECONOMY.GROOVY_MULTIPLIER - 1));
  }

  const total = subtotal + groovyBonus;

  return {
    kills: kills.length,
    killReward,
    leaderKills,
    leaderKillReward,
    survivalBonus,
    participationBonus,
    groovyBonus,
    total,
  };
}

export function determineLeader(scores: Map<string, number>): string | null {
  let maxScore = 0;
  let leaderId: string | null = null;

  for (const [playerId, score] of scores) {
    if (score > maxScore) {
      maxScore = score;
      leaderId = playerId;
    }
  }

  return leaderId;
}
