[index.html](https://github.com/user-attachments/files/29674121/index.html)
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<title>WarChess - 兵数制ストラテジー</title>
<meta name="theme-color" content="#7fb8ff" />
<meta name="description" content="兵力の分割・再配分を駆使する1対1ターン制陣取りゲーム WarChess" />
<link rel="manifest" href="manifest.json" />
<link rel="apple-touch-icon" href="icons/icon-192.png" />
<link rel="stylesheet" href="css/style.css" />
</head>
<body>
<div id="app">

  <!-- ===== メニュー画面 ===== -->
  <section id="menu-screen" class="screen">
    <div class="menu-card">
      <h1 class="logo">⚔️ WarChess</h1>
      <p class="tagline">兵を分け、束ね、地を制す。</p>
      <div id="mode-list" class="mode-list"></div>
      <button id="rules-btn" class="btn btn-ghost">遊び方</button>
    </div>
  </section>

  <!-- ===== ゲーム画面 ===== -->
  <section id="game-screen" class="screen" hidden>
    <header id="topbar">
      <button id="menu-btn" class="icon-btn" title="メニュー">☰</button>
      <div id="turn-indicator" class="turn-indicator">配置フェーズ</div>
      <button id="log-btn" class="icon-btn" title="戦況ログ">📜</button>
    </header>

    <div id="canvas-wrap">
      <canvas id="board-canvas"></canvas>
      <div id="squad-info" class="squad-info" hidden></div>
    </div>

    <footer id="bottombar">
      <div id="deploy-panel" class="panel" hidden>
        <div id="deploy-list" class="deploy-list"></div>
        <div class="panel-actions">
          <button id="auto-deploy-btn" class="btn btn-secondary">ランダム自動配置</button>
          <button id="finish-deploy-btn" class="btn btn-primary">配置完了</button>
        </div>
      </div>

      <div id="battle-panel" class="panel" hidden>
        <div id="card-hand" class="card-hand"></div>
        <div class="panel-actions">
          <button id="split-btn" class="btn btn-action" disabled>✂️ 分隊</button>
          <button id="merge-btn" class="btn btn-action" disabled>🔗 統合</button>
          <button id="card-btn" class="btn btn-action" disabled>🎴 カード</button>
          <button id="cancel-btn" class="btn btn-ghost" disabled>選択解除</button>
          <button id="end-turn-btn" class="btn btn-primary">ターン終了</button>
        </div>
        <button id="surrender-btn" class="btn btn-danger-ghost">降伏する</button>
      </div>
    </footer>
  </section>

  <!-- ===== 戦闘結果ポップアップ ===== -->
  <div id="combat-modal" class="modal-overlay" hidden>
    <div class="modal-card">
      <h2 id="combat-title">戦闘結果</h2>
      <div id="combat-body" class="combat-body"></div>
      <button id="combat-close-btn" class="btn btn-primary">閉じる</button>
    </div>
  </div>

  <!-- ===== 勝敗画面 ===== -->
  <div id="result-modal" class="modal-overlay" hidden>
    <div class="modal-card">
      <h2 id="result-title">決着!</h2>
      <p id="result-desc"></p>
      <button id="restart-btn" class="btn btn-primary">メニューに戻る</button>
    </div>
  </div>

  <!-- ===== ログドロワー ===== -->
  <div id="log-drawer" class="drawer" hidden>
    <div class="drawer-header">
      <span>戦況ログ</span>
      <button id="log-close-btn" class="icon-btn">✕</button>
    </div>
    <div id="log-list" class="log-list"></div>
  </div>

  <!-- ===== 分隊モーダル ===== -->
  <div id="split-modal" class="modal-overlay" hidden>
    <div class="modal-card">
      <h2>分隊</h2>
      <p>兵を2隊に分けます(各隊 最低10人)</p>
      <div class="split-row">
        <span id="split-a-label">A隊: 50</span>
        <input id="split-slider" type="range" min="10" max="90" value="50" />
        <span id="split-b-label">B隊: 50</span>
      </div>
      <p class="hint">分割後、隣接する空きマスをタップして新部隊の行き先を選んでください。</p>
      <div class="panel-actions">
        <button id="split-cancel-btn" class="btn btn-ghost">キャンセル</button>
        <button id="split-confirm-btn" class="btn btn-primary">行き先を選ぶ</button>
      </div>
    </div>
  </div>

  <!-- ===== 確認ダイアログ ===== -->
  <div id="confirm-modal" class="modal-overlay" hidden>
    <div class="modal-card">
      <p id="confirm-message"></p>
      <div class="panel-actions">
        <button id="confirm-no-btn" class="btn btn-ghost">キャンセル</button>
        <button id="confirm-yes-btn" class="btn btn-primary">OK</button>
      </div>
    </div>
  </div>

  <!-- ===== ルール説明 ===== -->
  <div id="rules-modal" class="modal-overlay" hidden>
    <div class="modal-card modal-scroll">
      <h2>遊び方</h2>
      <div class="rules-text">
        <p>① 自分の部隊をタップして選択(移動・攻撃できるマスが光ります)</p>
        <p>② 行き先や敵部隊をタップして、移動・突撃・射撃を実行</p>
        <p>③ 「分隊」で兵を分けて多方面に展開、「統合」で隣接する同兵種部隊をまとめられます</p>
        <p>④ 林にいる部隊は敵から種類が見えません(位置だけは常に見えます)</p>
        <p>⑤ 大将を討ち取れば勝利!全部隊が行動したら自動で相手の番になります</p>
        <p>歩兵&gt;騎兵&gt;弓兵&gt;歩兵 の三すくみに注意。丘・山は防御有利、林からの奇襲は一度きり効果的です。</p>
      </div>
      <button id="rules-close-btn" class="btn btn-primary">わかった</button>
    </div>
  </div>

</div>
<script type="module" src="js/main.js"></script>
</body>
</html>
