import { TERRAIN, ELEVATION, TERRAIN_DEFENSE } from './terrain.js';
import { advantageBonus, GENERAL_COMBAT_BONUS } from './units.js';
import { squadAt, orthogonalNeighbors } from './board.js';

/**
 * 1回の戦闘を解決する純粋関数。副作用なし(呼び出し側が結果を反映する)。
 * originTerrain: 攻撃側が「行動開始時に立っていたマス」の地形(奇襲判定用)
 * isRanged: 弓兵の射撃(反撃なし・移動不要)かどうか
 */
export function calcCombat({ attacker, defender, grid, size, squads, originTerrain, isRanged }) {
  const attackerLog = [];
  const defenderLog = [];

  const attackerBaseType = attacker.baseType || attacker.type;
  const defenderBaseType = defender.baseType || defender.type;

  let attackerPower = attacker.stats.rank;
  let defenderPower = defender.stats.rank;
  attackerLog.push({ label: `${attacker.stats.label}基本ランク`, value: attacker.stats.rank });
  defenderLog.push({ label: `${defender.stats.label}基本ランク`, value: defender.stats.rank });

  // 三すくみ相性
  const adv = advantageBonus(attackerBaseType, defenderBaseType);
  if (adv.attackerBonus) {
    attackerPower += adv.attackerBonus;
    attackerLog.push({ label: '相性有利', value: adv.attackerBonus });
  }
  if (adv.defenderBonus) {
    defenderPower += adv.defenderBonus;
    defenderLog.push({ label: '相性有利', value: adv.defenderBonus });
  }

  // 大将ボーナス
  if (attacker.isGeneral) {
    attackerPower += GENERAL_COMBAT_BONUS;
    attackerLog.push({ label: '大将ボーナス', value: GENERAL_COMBAT_BONUS });
  }
  if (defender.isGeneral) {
    defenderPower += GENERAL_COMBAT_BONUS;
    defenderLog.push({ label: '大将ボーナス', value: GENERAL_COMBAT_BONUS });
  }

  // 地形防御(防御側)
  const defTerrain = grid[defender.y][defender.x].terrain;
  let terrainDef = TERRAIN_DEFENSE[defTerrain] || 0;
  if (defender.tempShield) terrainDef += 2; // 盾構えカード
  if (terrainDef) {
    defenderPower += terrainDef;
    defenderLog.push({ label: `地形防御(${terrainLabel(defTerrain)}${defender.tempShield ? '+盾構え' : ''})`, value: terrainDef });
  }

  // 高低差(攻撃側視点: 高い場所から攻めるほど有利)
  const atkTerrain = originTerrain;
  const elevDiff = (ELEVATION[atkTerrain] ?? 0) - (ELEVATION[defTerrain] ?? 0);
  if (elevDiff !== 0) {
    const bonus = elevDiff * 2;
    attackerPower += bonus;
    attackerLog.push({ label: '高低差', value: bonus });
  }

  // 奇襲(林から攻撃、生涯1回)
  let ambushUsed = false;
  if (atkTerrain === TERRAIN.FOREST && !attacker.usedAmbush) {
    attackerPower += 2;
    attackerLog.push({ label: '奇襲', value: 2 });
    ambushUsed = true;
  }

  // 密集陣形(防御側に縦横隣接する味方の数 x1、鼓舞カードで+2/人)
  const neighbors = orthogonalNeighbors(size, defender.x, defender.y);
  let allyCount = 0;
  for (const n of neighbors) {
    const s = squadAt(squads, n.x, n.y);
    if (s && s.ownerId === defender.ownerId && s.id !== defender.id) allyCount++;
  }
  if (allyCount > 0) {
    let densityBonus = allyCount * 1;
    if (defender.tempInspire) densityBonus += allyCount * 2;
    defenderPower += densityBonus;
    defenderLog.push({ label: `密集陣形(隣接${allyCount})${defender.tempInspire ? '+鼓舞' : ''}`, value: densityBonus });
  }

  // 疲労(攻撃側)
  if (attacker.fatigue > 0) {
    attackerPower -= attacker.fatigue;
    attackerLog.push({ label: `疲労(${attacker.fatigue})`, value: -attacker.fatigue });
  }

  // 挟み込み(攻撃方向の真逆に味方がいる場合、ここまでの実効戦闘力を1.5倍)
  const dx = Math.sign(defender.x - attacker.x);
  const dy = Math.sign(defender.y - attacker.y);
  const oppositeX = defender.x + dx;
  const oppositeY = defender.y + dy;
  const oppositeSquad = squadAt(squads, oppositeX, oppositeY);
  let pincer = false;
  if (oppositeSquad && oppositeSquad.ownerId === attacker.ownerId && oppositeSquad.id !== attacker.id) {
    pincer = true;
    const before = attackerPower;
    attackerPower *= 1.5;
    attackerLog.push({ label: '挟み込み x1.5', value: Math.round((attackerPower - before) * 10) / 10 });
  }

  attackerPower = Math.max(0, attackerPower);
  defenderPower = Math.max(0, defenderPower);

  const attackerTotal = attackerPower * attacker.count;
  const defenderTotal = defenderPower * defender.count;
  const sum = attackerTotal + defenderTotal || 1;

  const attackerLossFrac = defenderTotal / sum;
  const defenderLossFrac = attackerTotal / sum;

  const defenderCasualties = Math.min(defender.count, Math.round(defender.count * defenderLossFrac));
  const attackerCasualties = isRanged ? 0 : Math.min(attacker.count, Math.round(attacker.count * attackerLossFrac));

  return {
    attackerPower,
    defenderPower,
    attackerLog,
    defenderLog,
    attackerCasualties,
    defenderCasualties,
    attackerRemaining: attacker.count - attackerCasualties,
    defenderRemaining: defender.count - defenderCasualties,
    ambushUsed,
    pincer,
    isRanged,
  };
}

function terrainLabel(t) {
  const labels = {
    [TERRAIN.PLAIN]: '平地',
    [TERRAIN.FOREST]: '林',
    [TERRAIN.HILL]: '丘',
    [TERRAIN.MOUNTAIN]: '山',
    [TERRAIN.WATER]: '水',
    [TERRAIN.ROAD]: '道',
  };
  return labels[t] || t;
}
