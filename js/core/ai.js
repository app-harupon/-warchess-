// シンプルなスコアリング型CPU AI(相性・撃破ボーナス・自部隊壊滅回避を考慮)
import { UNIT_TYPES } from './units.js';
import { getReachable, getMeleeTargets, getArcherTargets, moveSquad, meleeAttack, rangedAttack, endTurn } from './rules.js';
import { calcCombat } from './combat.js';

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function nearestEnemyDist(state, squad, fromX, fromY) {
  const enemies = state.squads.filter((s) => s.ownerId !== squad.ownerId);
  if (!enemies.length) return 999;
  return Math.min(...enemies.map((e) => manhattan({ x: fromX, y: fromY }, e)));
}

function simulateCombat(state, attacker, defender, fromX, fromY, isRanged) {
  const origX = attacker.x;
  const origY = attacker.y;
  const originTerrain = state.grid[origY][origX].terrain;
  attacker.x = fromX;
  attacker.y = fromY;
  const result = calcCombat({
    attacker,
    defender,
    grid: state.grid,
    size: state.size,
    squads: state.squads,
    originTerrain,
    isRanged,
  });
  attacker.x = origX;
  attacker.y = origY;
  return result;
}

function scoreAttack(result, defender) {
  const defenderLossFrac = result.defenderCasualties / Math.max(1, defender.count);
  const attackerLossFrac = result.attackerCasualties / 100;
  let score = defenderLossFrac * 10 - attackerLossFrac * 13;
  if (defender.isGeneral) score += 8;
  if (result.defenderRemaining <= 0) score += 10;
  if (result.attackerRemaining <= 0) score -= 15;
  return score;
}

function decideAction(state, squad) {
  const candidates = [];

  const meleeTargets = squad.type !== UNIT_TYPES.ARCHER ? getMeleeTargets(state, squad) : [];
  for (const { target, from } of meleeTargets) {
    const result = simulateCombat(state, squad, target, from.x, from.y, false);
    candidates.push({ type: 'melee', target, from, score: scoreAttack(result, target) });
  }

  if (squad.type === UNIT_TYPES.ARCHER) {
    const archerTargets = getArcherTargets(state, squad);
    for (const { target } of archerTargets) {
      const result = simulateCombat(state, squad, target, squad.x, squad.y, true);
      candidates.push({ type: 'ranged', target, score: scoreAttack(result, target) + 2 });
    }
  }

  const reachable = getReachable(state, squad);
  const curDist = nearestEnemyDist(state, squad, squad.x, squad.y);
  let bestMove = null;
  for (const tile of reachable.values()) {
    const dist = nearestEnemyDist(state, squad, tile.x, tile.y);
    let score = (curDist - dist) * 0.5;
    const terrain = state.grid[tile.y][tile.x].terrain;
    if (terrain === 'forest') score += 0.3;
    if (terrain === 'hill' || terrain === 'mountain') score += 0.2;
    if (!bestMove || score > bestMove.score) bestMove = { type: 'move', x: tile.x, y: tile.y, score };
  }
  if (bestMove) candidates.push(bestMove);

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function executeAction(state, squad, action) {
  if (action.type === 'melee') {
    meleeAttack(state, squad, action.target, action.from);
  } else if (action.type === 'ranged') {
    rangedAttack(state, squad, action.target);
  } else if (action.type === 'move') {
    moveSquad(state, squad, action.x, action.y);
  }
}

export function cpuTakeTurn(state, playerId = 'B') {
  let safety = 0;
  while (state.phase === 'battle' && state.currentPlayer === playerId && safety < 1000) {
    safety++;
    const squad = state.squads.find((s) => s.ownerId === playerId && s.alive && !s.actedThisTurn);
    if (!squad) break;
    const action = decideAction(state, squad);
    if (!action || action.score < -8) {
      squad.actedThisTurn = true;
      continue;
    }
    executeAction(state, squad, action);
  }
  if (state.phase === 'battle' && state.currentPlayer === playerId) endTurn(state);
}
