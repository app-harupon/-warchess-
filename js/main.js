import { MODES, getMode } from './core/modes.js';
import { canSplit, canMerge } from './core/squad.js';
import { isAdjacent } from './core/board.js';
import {
  createGame,
  emptyDeployTiles,
  placeSquad,
  autoDeployRemaining,
  startBattle,
  getReachable,
  getMeleeTargets,
  getArcherTargets,
  moveSquad,
  meleeAttack,
  rangedAttack,
  splitSquad,
  mergeSquads,
  playCard,
  playableCards,
  endTurn,
  surrender,
} from './core/rules.js';
import { cpuTakeTurn } from './core/ai.js';
import { Renderer } from './ui/render.js';
import { InputController } from './ui/input.js';

const $ = (id) => document.getElementById(id);

const menuScreen = $('menu-screen');
const gameScreen = $('game-screen');
const modeList = $('mode-list');
const turnIndicator = $('turn-indicator');
const canvas = $('board-canvas');
const canvasWrap = $('canvas-wrap');
const squadInfoEl = $('squad-info');
const deployPanel = $('deploy-panel');
const battlePanel = $('battle-panel');
const deployList = $('deploy-list');
const cardHand = $('card-hand');
const splitBtn = $('split-btn');
const mergeBtn = $('merge-btn');
const cardBtn = $('card-btn');
const cancelBtn = $('cancel-btn');
const combatModal = $('combat-modal');
const combatBody = $('combat-body');
const combatTitle = $('combat-title');
const resultModal = $('result-modal');
const resultTitle = $('result-title');
const resultDesc = $('result-desc');
const logDrawer = $('log-drawer');
const logList = $('log-list');
const splitModal = $('split-modal');
const splitSlider = $('split-slider');
const splitALabel = $('split-a-label');
const splitBLabel = $('split-b-label');
const rulesModal = $('rules-modal');
const confirmModal = $('confirm-modal');
const confirmMessage = $('confirm-message');
const confirmYesBtn = $('confirm-yes-btn');
const confirmNoBtn = $('confirm-no-btn');

function showConfirm(message, onYes) {
  confirmMessage.textContent = message;
  confirmModal.hidden = false;
  const cleanup = () => {
    confirmModal.hidden = true;
    confirmYesBtn.removeEventListener('click', onYesClick);
    confirmNoBtn.removeEventListener('click', onNoClick);
  };
  const onYesClick = () => {
    cleanup();
    onYes();
  };
  const onNoClick = () => cleanup();
  confirmYesBtn.addEventListener('click', onYesClick);
  confirmNoBtn.addEventListener('click', onNoClick);
}

let game = null;
let renderer = null;
let input = null;
let selectedDeployIndex = null;
let selection = null; // { squad, reachable, meleeTargets, archerTargets, pendingAction }

// ---------- 画面遷移 ----------
function showScreen(name) {
  menuScreen.hidden = name !== 'menu';
  gameScreen.hidden = name !== 'game';
}

function buildMenu() {
  modeList.innerHTML = '';
  for (const mode of Object.values(MODES)) {
    const btn = document.createElement('button');
    btn.className = `mode-card ${mode.id}`;
    btn.innerHTML = `<b>${mode.name}</b><span>${mode.desc}</span>`;
    btn.addEventListener('click', () => startGame(mode.id));
    modeList.appendChild(btn);
  }
}

function startGame(modeId) {
  game = createGame(getMode(modeId));
  selection = null;
  selectedDeployIndex = null;
  showScreen('game');
  if (!renderer) {
    renderer = new Renderer(canvas);
    input = new InputController(canvas, renderer, { onTap: handleBoardTap });
  }
  setTimeout(() => {
    renderer.resize();
    renderer.fitBoard(game.size);
    refreshDeployUI();
    render();
  }, 0);
}

window.addEventListener('resize', () => {
  if (!renderer || !game) return;
  renderer.resize();
  renderer.fitBoard(game.size);
  render();
});

// ---------- 描画 ----------
function render() {
  if (!game || !renderer) return;
  const view = { viewerId: 'A' };
  if (game.phase === 'deploy') {
    view.deployTiles = emptyDeployTiles(game, 'A');
  }
  if (selection) {
    view.selected = selection.squad;
    view.reachable = selection.reachable;
    view.meleeTargets = selection.meleeTargets;
    view.archerTargets = selection.archerTargets;
  }
  renderer.draw(game, view);
}

// ---------- 配置フェーズ ----------
function refreshDeployUI() {
  deployPanel.hidden = game.phase !== 'deploy';
  battlePanel.hidden = game.phase === 'deploy';
  if (game.phase !== 'deploy') {
    refreshBattleUI();
    return;
  }
  turnIndicator.textContent = `配置フェーズ (残り ${game.deployQueue.A.length})`;
  turnIndicator.className = 'turn-indicator';
  deployList.innerHTML = '';
  game.deployQueue.A.forEach((squad, idx) => {
    const chip = document.createElement('div');
    chip.className = 'deploy-chip' + (squad.isGeneral ? ' general' : '') + (idx === selectedDeployIndex ? ' selected' : '');
    chip.innerHTML = `<span class="icon">${squad.isGeneral ? '👑' : squad.stats.icon}</span><span>${squad.isGeneral ? '大将' : squad.stats.label}</span>`;
    chip.addEventListener('click', () => {
      selectedDeployIndex = idx;
      refreshDeployUI();
    });
    deployList.appendChild(chip);
  });
  if (selectedDeployIndex >= game.deployQueue.A.length) selectedDeployIndex = null;
}

$('auto-deploy-btn').addEventListener('click', () => {
  autoDeployRemaining(game, 'A');
  selectedDeployIndex = null;
  refreshDeployUI();
  render();
});

$('finish-deploy-btn').addEventListener('click', () => {
  if (game.deployQueue.A.length > 0) {
    autoDeployRemaining(game, 'A');
  }
  autoDeployRemaining(game, 'B');
  startBattle(game);
  selectedDeployIndex = null;
  refreshDeployUI();
  render();
});

// ---------- 戦闘フェーズ ----------
function refreshBattleUI() {
  const isPlayerTurn = game.currentPlayer === 'A';
  turnIndicator.textContent = `${game.turnNumber}ターン目 - ${isPlayerTurn ? 'あなたの番' : 'CPUの番'}`;
  turnIndicator.className = 'turn-indicator ' + (isPlayerTurn ? 'player-a' : 'player-b');
  $('end-turn-btn').disabled = !isPlayerTurn;
  $('surrender-btn').disabled = !isPlayerTurn;
  updateActionButtons();
  updateSquadInfoPanel();
  updateLog();
}

function updateActionButtons() {
  const canSelectAct = selection && selection.squad.ownerId === 'A' && !selection.squad.actedThisTurn && game.currentPlayer === 'A';
  splitBtn.disabled = !canSelectAct || !canSplit(selection?.squad, Math.floor((selection?.squad.count || 0) / 2));
  const mergeCandidates = canSelectAct ? getMergeCandidates(selection.squad) : [];
  mergeBtn.disabled = !canSelectAct || mergeCandidates.length === 0;
  const cards = canSelectAct ? playableCards(game, 'A', selection.squad) : [];
  cardBtn.disabled = !canSelectAct || cards.length === 0;
  cancelBtn.disabled = !selection;
  renderCardHand(cards);
}

function getMergeCandidates(squad) {
  return game.squads.filter(
    (s) => s.id !== squad.id && canMerge(squad, s) && isAdjacent(squad.x, squad.y, s.x, s.y)
  );
}

function renderCardHand(cards) {
  cardHand.innerHTML = '';
  cardHand.classList.remove('open');
  for (const card of cards) {
    const chip = document.createElement('div');
    chip.className = 'card-chip';
    chip.innerHTML = `<b>${card.name}</b>${card.desc}`;
    chip.addEventListener('click', () => {
      playCard(game, 'A', selection.squad, card.uid);
      const stillSelected = game.squads.find((s) => s.id === selection.squad.id);
      if (stillSelected && !stillSelected.actedThisTurn) {
        selectSquad(stillSelected);
      } else {
        clearSelection();
      }
      afterPlayerAction();
    });
    cardHand.appendChild(chip);
  }
}

cardBtn.addEventListener('click', () => cardHand.classList.toggle('open'));

function updateSquadInfoPanel() {
  if (!selection) {
    squadInfoEl.hidden = true;
    return;
  }
  const s = selection.squad;
  squadInfoEl.hidden = false;
  squadInfoEl.innerHTML = `
    <b>${s.isGeneral ? '👑 大将 ' : ''}${s.stats.icon} ${s.stats.label}${s.ownerId === 'B' ? '(敵)' : ''}</b>
    <div class="stat-row"><span>兵数</span><span>${s.count}</span></div>
    <div class="stat-row"><span>ランク</span><span>${s.stats.rank}</span></div>
    <div class="stat-row"><span>移動力</span><span>${s.stats.move + (s.tempMoveBonus || 0)}</span></div>
    <div class="stat-row"><span>疲労</span><span>${s.fatigue}</span></div>
  `;
}

function updateLog() {
  logList.innerHTML = game.log
    .slice(-200)
    .map((l) => `<div>${l}</div>`)
    .join('');
  logList.scrollTop = logList.scrollHeight;
}

// ---------- 選択・行動 ----------
function selectSquad(squad) {
  selection = {
    squad,
    reachable: getReachable(game, squad),
    meleeTargets: getMeleeTargets(game, squad),
    archerTargets: squad.stats.range > 1 ? getArcherTargets(game, squad) : [],
  };
  refreshBattleUI();
  render();
}

function clearSelection() {
  selection = null;
  refreshBattleUI();
  render();
}

cancelBtn.addEventListener('click', clearSelection);

function findSquadAt(x, y) {
  return game.squads.find((s) => s.alive && s.x === x && s.y === y) || null;
}

function handleBoardTap(x, y) {
  if (!game || x < 0 || y < 0 || x >= game.size || y >= game.size) return;
  if (game.phase === 'deploy') return handleDeployTap(x, y);
  if (game.phase !== 'battle' || game.currentPlayer !== 'A') return;

  if (selection?.pendingAction === 'split-dest') {
    tryFinishSplit(x, y);
    return;
  }
  if (selection?.pendingAction === 'merge') {
    tryFinishMerge(x, y);
    return;
  }

  const tapped = findSquadAt(x, y);

  if (selection) {
    const sq = selection.squad;
    if (tapped && tapped.id === sq.id) {
      clearSelection();
      return;
    }
    if (tapped && tapped.ownerId === 'A' && !tapped.actedThisTurn) {
      selectSquad(tapped);
      return;
    }
    if (tapped && tapped.ownerId === 'B') {
      const melee = selection.meleeTargets.find((m) => m.target.id === tapped.id);
      if (melee) {
        meleeAttack(game, sq, melee.target, melee.from);
        afterCombatAction();
        return;
      }
      const archer = selection.archerTargets.find((a) => a.target.id === tapped.id);
      if (archer) {
        rangedAttack(game, sq, archer.target);
        afterCombatAction();
        return;
      }
      clearSelection();
      return;
    }
    if (!tapped && selection.reachable.has(`${x},${y}`)) {
      moveSquad(game, sq, x, y);
      afterPlayerAction();
      return;
    }
    clearSelection();
    return;
  }

  if (tapped && tapped.ownerId === 'A' && !tapped.actedThisTurn) {
    selectSquad(tapped);
  }
}

function handleDeployTap(x, y) {
  if (selectedDeployIndex == null) return;
  if (placeSquad(game, 'A', selectedDeployIndex, x, y)) {
    selectedDeployIndex = null;
    refreshDeployUI();
    render();
  }
}

// ---------- 分隊 ----------
splitBtn.addEventListener('click', () => {
  if (splitBtn.disabled) return;
  const squad = selection.squad;
  const max = squad.count - 10;
  splitSlider.min = 10;
  splitSlider.max = max;
  splitSlider.value = Math.floor(squad.count / 2);
  updateSplitLabels(squad.count);
  splitModal.hidden = false;
});

splitSlider.addEventListener('input', () => updateSplitLabels(selection.squad.count));

function updateSplitLabels(total) {
  const a = Number(splitSlider.value);
  splitALabel.textContent = `A隊: ${a}`;
  splitBLabel.textContent = `B隊: ${total - a}`;
}

$('split-cancel-btn').addEventListener('click', () => (splitModal.hidden = true));

$('split-confirm-btn').addEventListener('click', () => {
  splitModal.hidden = true;
  selection.pendingAction = 'split-dest';
  selection.splitAmount = Number(splitSlider.value);
});

function tryFinishSplit(x, y) {
  const squad = selection.squad;
  const amount = selection.splitAmount;
  const result = splitSquad(game, squad, amount, x, y);
  if (result) {
    afterPlayerAction();
  } else {
    selection.pendingAction = null;
    updateActionButtons();
    render();
  }
}

// ---------- 統合 ----------
mergeBtn.addEventListener('click', () => {
  if (mergeBtn.disabled) return;
  selection.pendingAction = 'merge';
});

function tryFinishMerge(x, y) {
  const squad = selection.squad;
  const target = findSquadAt(x, y);
  if (target && canMerge(squad, target) && isAdjacent(squad.x, squad.y, target.x, target.y)) {
    mergeSquads(game, squad, target);
    afterPlayerAction();
  } else {
    selection.pendingAction = null;
    updateActionButtons();
    render();
  }
}

// ---------- ターン終了・降伏 ----------
$('end-turn-btn').addEventListener('click', () => {
  clearSelectionSilent();
  endTurn(game);
  afterPlayerAction();
});

$('surrender-btn').addEventListener('click', () => {
  showConfirm('本当に降伏しますか?', () => {
    surrender(game, 'A');
    afterPlayerAction();
  });
});

function clearSelectionSilent() {
  selection = null;
}

// ---------- 戦闘後処理 ----------
function afterCombatAction() {
  const combat = game.lastCombat;
  clearSelectionSilent();
  if (combat) {
    showCombatModal(combat);
  } else {
    afterPlayerAction();
  }
}

function showCombatModal(c) {
  combatTitle.textContent = c.defenderDied ? '撃破!' : c.attackerDied ? '反撃で被害……' : '交戦結果';
  const side = (title, log, casualties, remaining) => `
    <div class="side">
      <b>${title}</b>
      ${log.map((b) => `<div class="bonus-line"><span>${b.label}</span><span>${b.value > 0 ? '+' : ''}${b.value}</span></div>`).join('')}
      <div class="bonus-line total-line"><span>損害</span><span>${casualties}人</span></div>
      <div class="bonus-line"><span>残存</span><span>${remaining}人</span></div>
    </div>`;
  combatBody.innerHTML =
    side('攻撃側 ' + c.attackerName, c.attackerLog, c.attackerCasualties, c.attackerRemaining) +
    (c.isRanged ? '<p class="hint">弓兵の射撃には反撃がありません</p>' : '') +
    side('防御側 ' + c.defenderName, c.defenderLog, c.defenderCasualties, c.defenderRemaining) +
    `<div class="result-line">${c.defenderDied ? '敵部隊は壊滅した!' : c.attackerDied ? '味方部隊が壊滅した……' : ''}</div>`;
  combatModal.hidden = false;
}

$('combat-close-btn').addEventListener('click', () => {
  combatModal.hidden = true;
  afterPlayerAction();
});

function afterPlayerAction() {
  refreshDeployUI();
  render();
  if (game.phase === 'over') {
    showResult();
    return;
  }
  if (game.phase === 'battle' && game.currentPlayer === 'B') {
    setTimeout(runCpuTurn, 400);
  }
}

function runCpuTurn() {
  cpuTakeTurn(game, 'B');
  refreshDeployUI();
  render();
  if (game.phase === 'over') showResult();
}

function showResult() {
  if (game.winner === 'draw') {
    resultTitle.textContent = '引き分け';
    resultDesc.textContent = '両軍の大将が相討ちとなりました。';
  } else {
    const winnerName = game.players[game.winner].name;
    resultTitle.textContent = game.winner === 'A' ? '勝利!' : '敗北……';
    resultDesc.textContent = `${winnerName}の勝利です。`;
  }
  resultModal.hidden = false;
}

$('restart-btn').addEventListener('click', () => {
  resultModal.hidden = true;
  showScreen('menu');
});

// ---------- ログドロワー ----------
$('log-btn').addEventListener('click', () => {
  logDrawer.hidden = false;
  updateLog();
});
$('log-close-btn').addEventListener('click', () => (logDrawer.hidden = true));

// ---------- メニュー・ルール ----------
$('menu-btn').addEventListener('click', () => {
  showConfirm('メニューに戻りますか?(進行中の対戦は失われます)', () => showScreen('menu'));
});
$('rules-btn').addEventListener('click', () => (rulesModal.hidden = false));
$('rules-close-btn').addEventListener('click', () => (rulesModal.hidden = true));

// ---------- 初期化 ----------
buildMenu();
showScreen('menu');
registerServiceWorker();

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}
