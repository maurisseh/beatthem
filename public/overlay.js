let lastState = null;
let boardLayer = null;
let questionLayer = null;
let roundBadge = null;
let winnerLayer = null, winnerBackdrop = null, winnerContent = null, winnerCanvas = null;
let winnerKey = null;
let confettiRaf = null;

initStage();
connectLiveState(renderOverlay);
setupStageScaling();

// Baut das gemeinsame Stage-Layout (Logo, Avatare, Host-Facecam) auf und
// legt im Spielinhalt-Bereich zwei Ebenen an: Board (dahinter) + Frage (davor).
function initStage() {
  const stageEl = document.getElementById('stage');
  const stage = Stage.init(stageEl);

  boardLayer = document.createElement('div');
  boardLayer.className = 'board-layer';
  stage.content.appendChild(boardLayer);

  questionLayer = document.createElement('div');
  questionLayer.className = 'question-layer';
  stage.content.appendChild(questionLayer);

  roundBadge = document.createElement('div');
  roundBadge.className = 'round-badge';
  stageEl.appendChild(roundBadge);

  // Gewinner-Ebene (liegt über allem außer deiner Facecam-Umrandung)
  winnerLayer = document.createElement('div');
  winnerLayer.className = 'winner-layer';
  winnerBackdrop = document.createElement('div');
  winnerBackdrop.className = 'winner-dim';
  winnerBackdrop.style.clipPath = Stage.holeClip(); // deine Facecam bleibt unabgedunkelt
  const raysWrap = document.createElement('div');
  raysWrap.className = 'winner-rays-wrap';
  const rays = document.createElement('div');
  rays.className = 'winner-rays';
  raysWrap.appendChild(rays);
  const raysClip = document.createElement('div'); // schneidet deine Facecam-Fläche aus den Strahlen aus
  raysClip.className = 'winner-rays-clip';
  raysClip.style.clipPath = Stage.holeClip();
  raysClip.appendChild(raysWrap);
  winnerCanvas = document.createElement('canvas');
  winnerCanvas.className = 'winner-canvas';
  winnerCanvas.width = 1920;
  winnerCanvas.height = 1080;
  winnerContent = document.createElement('div');
  winnerContent.className = 'winner-content';
  const winnerFade = document.createElement('div');
  winnerFade.className = 'winner-fade';
  winnerFade.style.clipPath = Stage.holeClip();
  winnerLayer.append(winnerBackdrop, raysClip, winnerFade, winnerContent, winnerCanvas);
  stageEl.appendChild(winnerLayer);
}

function setupStageScaling() {
  function fit() {
    const stage = document.getElementById('stage');
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    const x = (window.innerWidth - 1920 * scale) / 2;
    const y = (window.innerHeight - 1080 * scale) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }
  window.addEventListener('resize', fit);
  fit();
}

function renderOverlay(state) {
  lastState = state;
  const jp = state.games.jeopardy;
  applyThemeColors(state.settings);
  applyGlowSettings(state.settings);

  roundBadge.textContent = (currentBoard(state).name || '').toUpperCase(); // Name des Bretts

  Stage.update(state); // Logo-PNG, Avatare, Host-Facecam, Blinken des aktiven Spielers
  renderBoard(state);
  renderQuestion(state);
  renderWinner(state);
}

function renderBoard(state) {
  const jp = state.games.jeopardy;
  const board = currentBoard(state);
  const cats = board.categories;
  const rows = Math.max(1, ...cats.map(c => c.questions.length));

  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';
  const grid = document.createElement('div');
  grid.className = 'board-grid';
  // Spalten = Kategorien, Zeilen = Punktwerte (beides pro Brett einstellbar)
  grid.style.gridTemplateColumns = `repeat(${cats.length}, 1fr)`;
  grid.style.gridTemplateRows = `68px repeat(${rows}, 1fr)`;
  const rowH = (Stage.SAFE_CONTENT_AREA.h - 68 - rows * 8) / rows;
  wrap.style.setProperty('--cell-fs', Math.min(38, Math.floor(rowH * 0.62)) + 'px');

  cats.forEach(cat => {
    const header = document.createElement('div');
    header.className = 'cat-header';
    header.textContent = cat.name;
    grid.appendChild(header);
  });

  for (let row = 0; row < rows; row++) {
    cats.forEach(cat => {
      const q = cat.questions[row];
      const cell = document.createElement('div');
      if (!q) { cell.className = 'cell answered'; grid.appendChild(cell); return; }
      cell.className = 'cell' + (q.answered ? ' answered' : '');
      cell.textContent = q.value;
      grid.appendChild(cell);
    });
  }

  wrap.appendChild(grid);
  boardLayer.innerHTML = '';
  boardLayer.appendChild(wrap);

  // Bei offener Frage ist NUR die Frage zu sehen — das Board wird komplett ausgeblendet
  boardLayer.classList.toggle('hidden', !!jp.activeQuestion);
}

function renderQuestion(state) {
  const jp = state.games.jeopardy;
  questionLayer.innerHTML = '';
  if (!jp.activeQuestion) return;

  const found = findQ(state, jp.activeQuestion);
  if (!found) return;
  const { q } = found;

  const card = document.createElement('div');
  card.className = 'question-card question-overlay';
  card.innerHTML = `
    <div class="question-value">${q.value} PUNKTE</div>
    ${q.question ? `<div class="question-text">${escapeHtml(q.question)}</div>` : ''}
    ${q.mediaType === 'image' ? `<img class="question-img" src="${questionImageUrl(q)}" alt="">` : ''}
    ${!q.question && q.mediaType !== 'image' ? '<div class="question-text">(Keine Frage hinterlegt)</div>' : ''}
    ${jp.showAnswer ? `<div class="answer-text">${escapeHtml(q.answer || '(Keine Antwort hinterlegt)')}</div>` : ''}
  `;
  questionLayer.appendChild(card);
}

// ---------------- Gewinner-Animation ----------------

function renderWinner(state) {
  const jp = state.games.jeopardy;
  const players = state.players || [];
  if (!jp.winnerShown || players.length === 0) { hideWinner(); return; }

  const max = Math.max(...players.map(p => p.score));
  const winners = players.filter(p => p.score === max).slice(0, 4);
  const key = winners.map(w => w.id + ':' + w.score).join('|') + '#' + (jp.winnerTs || 0);
  if (key === winnerKey) return; // läuft bereits mit denselben Daten
  winnerKey = key;

  const tie = winners.length > 1;
  const main = winners[0];
  winnerLayer.style.setProperty('--wc', hexToRgbTriplet(main.color));

  const sz = tie ? 230 : 340, nsz = tie ? 56 : 96, ssz = tie ? 38 : 52;
  winnerContent.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'winner-title';
  title.textContent = tie ? 'UNENTSCHIEDEN' : '🏆 GEWINNER 🏆';
  winnerContent.appendChild(title);

  const row = document.createElement('div');
  row.className = 'winner-row';
  winners.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'winner-card';
    card.style.animationDelay = (0.35 + i * 0.15) + 's';
    card.style.setProperty('--pc', p.color);
    card.style.setProperty('--sz', sz + 'px');
    card.style.setProperty('--nsz', nsz + 'px');
    card.style.setProperty('--ssz', ssz + 'px');
    card.style.setProperty('--cw', (tie ? 400 : 1200) + 'px');

    const avWrap = document.createElement('div');
    avWrap.className = 'winner-avatar-wrap';
    const glow = document.createElement('div');
    glow.className = 'winner-glow';
    const av = document.createElement('div');
    av.className = 'winner-avatar';
    if (p.avatar) {
      const img = document.createElement('img');
      img.src = p.avatar;
      img.alt = '';
      av.appendChild(img);
    } else {
      const ph = document.createElement('span');
      ph.className = 'ph';
      ph.textContent = '?';
      av.appendChild(ph);
    }
    const name = document.createElement('div');
    name.className = 'winner-name';
    name.textContent = p.name;
    const score = document.createElement('div');
    score.className = 'winner-score';
    score.textContent = p.score + ' PUNKTE';

    avWrap.append(glow, av);
    card.append(avWrap, name, score);
    row.appendChild(card);
  });
  winnerContent.appendChild(row);

  winnerLayer.classList.add('show');
  document.getElementById('stage').classList.add('winner-on');
  startConfetti([...winners.map(w => w.color), '#f5c518', '#ffffff', '#ffd966']);
}

function hideWinner() {
  if (winnerKey === null && !winnerLayer.classList.contains('show')) return;
  winnerKey = null;
  winnerLayer.classList.remove('show');
  document.getElementById('stage').classList.remove('winner-on');
  setTimeout(() => { if (!winnerLayer.classList.contains('show')) stopConfetti(); }, 700);
}

function startConfetti(colors) {
  stopConfetti();
  const ctx = winnerCanvas.getContext('2d');
  const W = 1920, H = 1080;
  const make = (initial, i) => ({
    x: Math.random() * W,
    y: initial ? -Math.random() * H : -30,
    w: 10 + Math.random() * 14,
    h: 16 + Math.random() * 18,
    vy: 2.5 + Math.random() * 4.5,
    vx: -1.5 + Math.random() * 3,
    rot: Math.random() * Math.PI * 2,
    vr: -0.15 + Math.random() * 0.3,
    sway: Math.random() * Math.PI * 2,
    color: colors[i % colors.length]
  });
  const parts = Array.from({ length: 170 }, (_, i) => make(true, i));

  (function frame() {
    ctx.clearRect(0, 0, W, H);
    parts.forEach((p, i) => {
      p.y += p.vy;
      p.sway += 0.05;
      p.x += p.vx + Math.sin(p.sway) * 1.3;
      p.rot += p.vr;
      if (p.y > H + 30) Object.assign(p, make(false, i));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    confettiRaf = requestAnimationFrame(frame);
  })();
}

function stopConfetti() {
  if (confettiRaf) cancelAnimationFrame(confettiRaf);
  confettiRaf = null;
  if (winnerCanvas) winnerCanvas.getContext('2d').clearRect(0, 0, 1920, 1080);
}

function findQ(state, ref) {
  const board = state.games.jeopardy.boards.find(b => b.id === ref.boardId);
  const cat = board && board.categories.find(c => c.id === ref.catId);
  const q = cat && cat.questions.find(q => q.id === ref.qId);
  return q ? { board, cat, q } : null;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
