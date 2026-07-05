// 兵種の定義、三すくみ相性、特殊カード定義

export const UNIT_TYPES = {
  INFANTRY: 'infantry',
  ARCHER: 'archer',
  CAVALRY: 'cavalry',
};

export const UNIT_STATS = {
  [UNIT_TYPES.INFANTRY]: { rank: 5, move: 2, range: 1, label: '歩兵', icon: '🛡️' },
  [UNIT_TYPES.ARCHER]: { rank: 6, move: 1, range: 5, label: '弓兵', icon: '🏹' },
  [UNIT_TYPES.CAVALRY]: { rank: 7, move: 3, range: 1, label: '騎兵', icon: '🐎' },
};

export const INITIAL_SOLDIERS = 100;
export const MIN_SPLIT_SOLDIERS = 10;

// 三すくみ: 歩兵 > 騎兵 > 弓兵 > 歩兵
const BEATS = {
  [UNIT_TYPES.INFANTRY]: UNIT_TYPES.CAVALRY,
  [UNIT_TYPES.CAVALRY]: UNIT_TYPES.ARCHER,
  [UNIT_TYPES.ARCHER]: UNIT_TYPES.INFANTRY,
};

export function advantageBonus(attackerType, defenderType) {
  // 戻り値: { attackerBonus, defenderBonus }
  if (BEATS[attackerType] === defenderType) return { attackerBonus: 3, defenderBonus: 0 };
  if (BEATS[defenderType] === attackerType) return { attackerBonus: 0, defenderBonus: 3 };
  return { attackerBonus: 0, defenderBonus: 0 };
}

export function randomUnitType() {
  const types = Object.values(UNIT_TYPES);
  return types[Math.floor(Math.random() * types.length)];
}

// 大将の精鋭ボーナス(基本ランク+2)
export const GENERAL_RANK_BONUS = 2;
// 戦闘中の大将参加ボーナス
export const GENERAL_COMBAT_BONUS = 3;

// --- 特殊カード ---
// effect: 'shield' | 'rapid' | 'charge' | 'inspire'
export const CARD_DEFS = {
  shield: {
    id: 'shield',
    unitType: UNIT_TYPES.INFANTRY,
    name: '盾構え',
    desc: 'この部隊は次に防御する戦闘だけ地形防御+2',
    effect: 'shield',
  },
  rapid: {
    id: 'rapid',
    unitType: UNIT_TYPES.ARCHER,
    name: '連射',
    desc: '反撃なしのまま同ターン中にもう一度射撃できる',
    effect: 'rapid',
  },
  charge: {
    id: 'charge',
    unitType: UNIT_TYPES.CAVALRY,
    name: '強行突破',
    desc: 'このターンだけ移動力+2',
    effect: 'charge',
  },
  inspire: {
    id: 'inspire',
    unitType: 'general',
    name: '鼓舞',
    desc: '隣接する味方全員に密集陣形ボーナス+2を追加(次の相手ターンまで)',
    effect: 'inspire',
  },
};

export function initialHand() {
  // 各兵種1枚ずつ配布するシンプルな初期手札
  return Object.values(CARD_DEFS).map((c) => ({ ...c, uid: `${c.id}_${Math.random().toString(36).slice(2, 8)}` }));
}
