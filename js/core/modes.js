// ゲームモード設定(盤面サイズ・部隊数だけがモードごとに違う)

export const MODES = {
  easy: {
    id: 'easy',
    name: 'お手軽モード',
    desc: '7x7・1陣営3部隊。数分で気軽に遊べる。',
    boardSize: 7,
    deployDepth: 1,
    squadCount: 3, // 大将1 + 一般2
  },
  normal: {
    id: 'normal',
    name: 'ノーマルモード',
    desc: '15x15・1陣営10部隊。歯ごたえのある標準戦。',
    boardSize: 15,
    deployDepth: 2,
    squadCount: 10, // 大将1 + 一般9
  },
  large: {
    id: 'large',
    name: '大規模バトルモード',
    desc: '30x30・1陣営25部隊。分隊・統合を駆使する本格戦。',
    boardSize: 30,
    deployDepth: 3,
    squadCount: 25, // 大将1 + 一般24
  },
};

export function getMode(id) {
  return MODES[id] || MODES.easy;
}
