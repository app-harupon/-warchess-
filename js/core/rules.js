import { generateTerrain, TERRAIN } from './terrain.js';
import { UNIT_TYPES, randomUnitType, initialHand, CARD_DEFS } from './units.js';
import { createSquad, canSplit, canMerge } from './squad.js';
import {
  computeReachable,
  computeMeleeTargets,
  computeArcherTargets,
  squadAt,
  isAdjacent,
  inBounds,
} from './board.js';
import { calcCombat } from './combat.js';

export function other(playerId) {
  return playerId === 'A' ? 'B' : 'A';
}

export function generateSquadTemplates(mode, ownerId) {
  const generalType = randomUnitType();
  const list = [createSquad({ ownerId, type: generalType, isGeneral: true })];
  for (let i = 1; i < mode.squadCount; i++) {
    list.push(createSquad({ ownerId, type: randomUnitType() }));
  }
  return list;
}

export function createGame(mode) {
  const grid = generateTerrain(mode.boardSize, mode.deployDepth);
  const state = {
    mode,
    size: mode.boardSize,
    grid,
    squads: [],
    players: {
      A: { id: 'A', name: 'あなた', hand: initialHand() },
      B: { id: 'B', name: 'CPU', hand: initialHand() },
    },
    deployQueue: {
      A: generateSquadTemplates(mode, 'A'),
      B: generateSquadTemplates(mode, 'B'),
    },
    phase: 'deploy',
    currentPlayer: 'A',
    turnNumber: 1,
    winner: null,
    log: [],
    lastCombat: null,
  };
  return state;
}

export function deployZoneRows(state, playerId) {
  const { size, mode } = state;
  if (playerId === 'A') {
    return [size - mode.deployDepth, size - 1];
  }
  return [0, mode.deployDepth - 1];
}

export function isDeployTile(state, playerId, x, y) {
  const [lo, hi] = deployZoneRows(state, playerId);
  if (y < lo || y > hi) return false;
  const t = state.grid[y][x].terrain;
  return t === TERRAIN.PLAIN || t === TERRAIN.ROAD;
}

export function emptyDeployTiles(state, playerId) {
  const { size } = state;
  const tiles = [];
  const [lo, hi] = deployZoneRows(state, playerId);
  for (let y = lo; y <= hi; y++) {
    for (let x = 0; x < size; x++) {
      if (isDeployTile(state, playerId, x, y) && !squadAt(state.squads, x, y)) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

export function placeSquad(state, playerId, templateIndex, x, y) {
  const queue = state.deployQueue[playerId];
  const squad = queue[templateIndex];
  if (!squad) return false;
  if (!isDeployTile(state, playerId, x, y)) return false;
  if (squadAt(state.squads, x, y)) return false;
  squad.x = x;
  squad.y = y;
  state.squads.push(squad);
  queue.splice(templateIndex, 1);
  return true;
}

export function autoDeployRemaining(state, playerId) {
  const queue = state.deployQueue[playerId];
  while (queue.length) {
    const tiles = emptyDeployTiles(state, playerId);
    if (!tiles.length) break;
    const tile = tiles[Math.floor(Math.random() * tiles.length)];
    placeSquad(state, playerId, 0, tile.x, tile.y);
  }
}

export function startBattle(state) {
  state.phase = 'battle';
  state.currentPlayer = 'A';
  state.log.push('戦闘開始!');
}

// --- 視認性(隠蔽)判定 ---
export function isConcealedFrom(state, squad, viewerId) {
  if (squad.ownerId === viewerId) return false;
  return state.grid[squad.y][squad.x].terrain === TERRAIN.FOREST;
}

export function getReachable(state, squad) {
  return computeReachable(state.grid, state.size, state.squads, squad, squad.tempMoveBonus || 0);
}

export function getMeleeTargets(state, squad) {
  const reachable = getReachable(state, squad);
  return computeMeleeTargets(state.grid, state.size, state.squads, squad, reachable);
}

export function getArcherTargets(state, squad) {
  return computeArcherTargets(state.grid, state.size, state.squads, squad);
}

function removeSquad(state, squad) {
  squad.alive = false;
  state.squads = state.squads.filter((s) => s.id !== squad.id);
}

function checkVictoryAfterCombat(state, attacker, defender, attackerDied, defenderDied) {
  const attackerGeneralDied = attackerDied && attacker.isGeneral;
  const defenderGeneralDied = defenderDied && defender.isGeneral;
  if (attackerGeneralDied && defenderGeneralDied) {
    state.phase = 'over';
    state.winner = 'draw';
    state.log.push('両軍の大将が相討ち……引き分け!');
  } else if (defenderGeneralDied) {
    state.phase = 'over';
    state.winner = attacker.ownerId;
    state.log.push(`${state.players[attacker.ownerId].name}の勝利!敵将を討ち取った!`);
  } else if (attackerGeneralDied) {
    state.phase = 'over';
    state.winner = defender.ownerId;
    state.log.push(`${state.players[defender.ownerId].name}の勝利!(反撃で大将討死)`);
  }
}

export function meleeAttack(state, squad, targetSquad, fromTile) {
  const originTerrain = state.grid[squad.y][squad.x].terrain;
  if (squad.x !== fromTile.x || squad.y !== fromTile.y) {
    squad.x = fromTile.x;
    squad.y = fromTile.y;
  }
  const result = calcCombat({
    attacker: squad,
    defender: targetSquad,
    grid: state.grid,
    size: state.size,
    squads: state.squads,
    originTerrain,
    isRanged: false,
  });
  if (result.ambushUsed) squad.usedAmbush = true;
  squad.fatigue += 1;
  targetSquad.count = result.defenderRemaining;
  squad.count = result.attackerRemaining;

  const defenderDied = targetSquad.count <= 0;
  const attackerDied = squad.count <= 0;
  if (defenderDied) removeSquad(state, targetSquad);
  if (attackerDied) {
    removeSquad(state, squad);
  } else {
    squad.actedThisTurn = true;
    if (defenderDied) {
      squad.x = targetSquad.x;
      squad.y = targetSquad.y;
    }
  }

  state.lastCombat = { ...result, attackerName: squadLabel(squad), defenderName: squadLabel(targetSquad), attackerDied, defenderDied };
  state.log.push(
    `${squadLabel(squad)}(${state.players[squad.ownerId].name})が${squadLabel(targetSquad)}(${state.players[targetSquad.ownerId].name})に突撃!`
  );
  checkVictoryAfterCombat(state, squad, targetSquad, attackerDied, defenderDied);
  maybeAutoEndTurn(state);
  return result;
}

export function rangedAttack(state, squad, targetSquad) {
  const originTerrain = state.grid[squad.y][squad.x].terrain;
  const result = calcCombat({
    attacker: squad,
    defender: targetSquad,
    grid: state.grid,
    size: state.size,
    squads: state.squads,
    originTerrain,
    isRanged: true,
  });
  squad.fatigue += 1;
  targetSquad.count = result.defenderRemaining;
  const defenderDied = targetSquad.count <= 0;
  if (defenderDied) removeSquad(state, targetSquad);

  if (squad.pendingRapid) {
    squad.pendingRapid = false;
  } else {
    squad.actedThisTurn = true;
  }

  state.lastCombat = { ...result, attackerName: squadLabel(squad), defenderName: squadLabel(targetSquad), attackerDied: false, defenderDied };
  state.log.push(`${squadLabel(squad)}(${state.players[squad.ownerId].name})が${squadLabel(targetSquad)}(${state.players[targetSquad.ownerId].name})を射撃!`);
  checkVictoryAfterCombat(state, squad, targetSquad, false, defenderDied);
  maybeAutoEndTurn(state);
  return result;
}

export function moveSquad(state, squad, x, y) {
  const reachable = getReachable(state, squad);
  const key = `${x},${y}`;
  if (!reachable.has(key)) return false;
  squad.x = x;
  squad.y = y;
  squad.fatigue = Math.max(0, squad.fatigue - 1);
  squad.actedThisTurn = true;
  state.log.push(`${squadLabel(squad)}(${state.players[squad.ownerId].name})が移動`);
  maybeAutoEndTurn(state);
  return true;
}

export function splitSquad(state, squad, amount, destX, destY) {
  if (!canSplit(squad, amount)) return null;
  if (!isAdjacent(squad.x, squad.y, destX, destY, squad.type === UNIT_TYPES.CAVALRY)) return null;
  if (!inBounds(state.size, destX, destY)) return null;
  if (squadAt(state.squads, destX, destY)) return null;
  const terrain = state.grid[destY][destX].terrain;
  if (terrain === TERRAIN.WATER) return null;

  const newSquad = createSquad({ ownerId: squad.ownerId, type: squad.type, x: destX, y: destY, count: amount });
  newSquad.actedThisTurn = true;
  squad.count -= amount;
  squad.actedThisTurn = true;
  state.squads.push(newSquad);
  state.log.push(`${squadLabel(squad)}が分隊(${amount}人)`);
  maybeAutoEndTurn(state);
  return newSquad;
}

export function mergeSquads(state, squadA, squadB) {
  if (!canMerge(squadA, squadB)) return false;
  if (!isAdjacent(squadA.x, squadA.y, squadB.x, squadB.y, squadA.type === UNIT_TYPES.CAVALRY)) return false;
  squadA.count += squadB.count;
  removeSquad(state, squadB);
  squadA.actedThisTurn = true;
  state.log.push(`${squadLabel(squadA)}が統合(計${squadA.count}人)`);
  maybeAutoEndTurn(state);
  return true;
}

export function playableCards(state, playerId, squad) {
  const hand = state.players[playerId].hand;
  const wantType = squad.isGeneral ? 'general' : squad.type;
  return hand.filter((c) => c.unitType === wantType);
}

export function playCard(state, playerId, squad, cardUid) {
  const hand = state.players[playerId].hand;
  const idx = hand.findIndex((c) => c.uid === cardUid);
  if (idx === -1) return false;
  const card = hand[idx];
  switch (card.effect) {
    case 'shield':
      squad.tempShield = true;
      squad.actedThisTurn = true;
      break;
    case 'charge':
      squad.tempMoveBonus = 2;
      break;
    case 'rapid':
      squad.pendingRapid = true;
      break;
    case 'inspire': {
      const neighbors = [
        { x: squad.x + 1, y: squad.y },
        { x: squad.x - 1, y: squad.y },
        { x: squad.x, y: squad.y + 1 },
        { x: squad.x, y: squad.y - 1 },
      ];
      for (const n of neighbors) {
        const ally = squadAt(state.squads, n.x, n.y);
        if (ally && ally.ownerId === squad.ownerId) ally.tempInspire = true;
      }
      squad.actedThisTurn = true;
      break;
    }
    default:
      return false;
  }
  hand.splice(idx, 1);
  state.log.push(`${squadLabel(squad)}が「${card.name}」を発動!`);
  maybeAutoEndTurn(state);
  return true;
}

function squadLabel(squad) {
  return `${squad.isGeneral ? '★大将' : squad.stats.label}`;
}

export function canAct(state, squad) {
  if (squad.actedThisTurn) return false;
  if (getReachable(state, squad).size > 0) return true;
  if (getMeleeTargets(state, squad).length > 0) return true;
  if (squad.type === UNIT_TYPES.ARCHER && getArcherTargets(state, squad).length > 0) return true;
  return false;
}

export function maybeAutoEndTurn(state) {
  if (state.phase !== 'battle') return;
  const mySquads = state.squads.filter((s) => s.ownerId === state.currentPlayer);
  const anyActionable = mySquads.some((s) => !s.actedThisTurn);
  if (!anyActionable) {
    endTurn(state);
  }
}

export function endTurn(state) {
  if (state.phase !== 'battle') return;
  const finishing = state.currentPlayer;
  const next = other(finishing);

  for (const s of state.squads) {
    if (s.ownerId === finishing) {
      s.tempMoveBonus = 0;
      s.pendingRapid = false;
    }
  }
  for (const s of state.squads) {
    if (s.ownerId === next) {
      s.actedThisTurn = false;
      s.tempShield = false;
      s.tempInspire = false;
    }
  }
  state.currentPlayer = next;
  if (next === 'A') state.turnNumber += 1;
  state.log.push(`--- ${state.players[next].name}のターン ---`);
}

export function surrender(state, playerId) {
  state.phase = 'over';
  state.winner = other(playerId);
  state.log.push(`${state.players[playerId].name}が降伏……${state.players[state.winner].name}の勝利!`);
}
