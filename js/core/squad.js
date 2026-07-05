import { UNIT_STATS, INITIAL_SOLDIERS, GENERAL_RANK_BONUS } from './units.js';

let uidCounter = 1;
function nextId() {
  return `sq${uidCounter++}`;
}

export function createSquad({ ownerId, type, isGeneral = false, x = -1, y = -1, count = INITIAL_SOLDIERS }) {
  const baseStats = UNIT_STATS[type];
  const stats = isGeneral
    ? { ...baseStats, rank: baseStats.rank + GENERAL_RANK_BONUS }
    : { ...baseStats };
  return {
    id: nextId(),
    ownerId,
    type,
    baseType: type,
    isGeneral,
    stats,
    count,
    x,
    y,
    alive: true,
    actedThisTurn: false,
    fatigue: 0,
    usedAmbush: false,
    tempShield: false,
    tempInspire: false,
    tempMoveBonus: 0,
    rapidAvailable: false,
  };
}

export function canSplit(squad, amount) {
  if (amount <= 0 || amount >= squad.count) return false;
  const remainder = squad.count - amount;
  return amount >= 10 && remainder >= 10;
}

export function canMerge(a, b) {
  return (
    a.ownerId === b.ownerId &&
    a.type === b.type &&
    !a.isGeneral &&
    !b.isGeneral &&
    a.alive &&
    b.alive
  );
}
