let lastState = null;

// Muss exakt mit den .facecam-frame-Positionen in overlay.html übereinstimmen!
const FACECAM_RECTS = [
  { x: 50, y: 722, w: 480, h: 270 },   // links
  { x: 1390, y: 722, w: 480, h: 270 }  // rechts
];

connectLiveState(renderOverlay);
setupStageScaling();

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

  document.getElementById('logo-text').textContent = state.settings.logoText || 'BEAT THE M';
  document.getElementById('round-badge').textContent =
    'RUNDE ' + jp.round + (jp.round === 2 ? ' — DOPPELTE PUNKTE' : '');

  renderBackground(state);
  renderBoardOrQuestion(state);
  renderFacecams(state);
}

// Hintergrundbild bekommt (nur falls gesetzt) zwei rechteckige "Löcher"
// exakt an den Facecam-Positionen -> dort bleibt es echt transparent,
// egal welches Hintergrundbild eingestellt ist.
function renderBackground(state) {
  const bg = document.getElementById('bg-layer');
  if (state.settings.backgroundImage) {
    bg.style.backgroundImage = `url("${state.settings.backgroundImage}")`;
    if (state.settings.showFacecams) {
      const outer = `M0 0 H1920 V1080 H0 Z`;
      const holes = FACECAM_RECTS.map(r =>
        `M${r.x} ${r.y} H${r.x + r.w} V${r.y + r.h} H${r.x} Z`
      ).join(' ');
      bg.style.clipPath = `path(evenodd, "${outer} ${holes}")`;
    } else {
      bg.style.clipPath = 'none';
    }
  } else {
    bg.style.backgroundImage = '';
    bg.style.clipPath = 'none';
  }
}

function renderBoardOrQuestion(state) {
  const jp = state.games.jeopardy;
  const area = document.getElementById('board-area');
  area.innerHTML = '';

  if (jp.activeQuestion) {
    const found = findQ(state, jp.activeQuestion);
    if (!found) return;
    const { q } = found;
    const card = document.createElement('div');
    card.className = 'question-card question-overlay';
    card.innerHTML = `
      <div class="question-value">${q.value} PUNKTE</div>
      <div class="question-text">${escapeHtml(q.question || '(Keine Frage hinterlegt)')}</div>
      ${jp.showAnswer ? `<div class="answer-text">${escapeHtml(q.answer || '(Keine Antwort hinterlegt)')}</div>` : ''}
    `;
    area.appendChild(card);
  } else {
    const board = currentBoard(state);
    const wrap = document.createElement('div');
    wrap.className = 'board-wrap overlay-board';
    wrap.id = 'board-container';

    const grid = document.createElement('div');
    grid.className = 'board-grid';

    board.forEach(cat => {
      const header = document.createElement('div');
      header.className = 'cat-header';
      header.textContent = cat.name;
      grid.appendChild(header);
    });

    for (let row = 0; row < 5; row++) {
      board.forEach(cat => {
        const q = cat.questions[row];
        const cell = document.createElement('div');
        cell.className = 'cell' + (q.answered ? ' answered' : '');
        cell.textContent = q.answered ? '' : q.value;
        grid.appendChild(cell);
      });
    }

    wrap.appendChild(grid);
    area.appendChild(wrap);
  }
}

function renderFacecams(state) {
  const leftEl = document.getElementById('facecam-left');
  const rightEl = document.getElementById('facecam-right');
  const leftSlot = document.querySelector('.facecam-slot.left');
  const rightSlot = document.querySelector('.facecam-slot.right');
  const fallback = document.getElementById('fallback-scoreboard');

  const show = state.settings.showFacecams;
  leftSlot.classList.toggle('hidden', !show);
  rightSlot.classList.toggle('hidden', !show);
  fallback.classList.toggle('hidden', !!show);

  leftEl.innerHTML = '';
  rightEl.innerHTML = '';
  fallback.innerHTML = '';

  state.players.forEach((p, i) => {
    const side = p.side === 'right' ? 'right' : (p.side === 'left' ? 'left' : (i % 2 === 0 ? 'left' : 'right'));
    const chip = document.createElement('div');
    chip.className = 'score-chip';
    chip.style.setProperty('--player-color', p.color);
    chip.innerHTML = `
      <div class="score-dot"></div>
      <div class="score-name">${escapeHtml(p.name)}</div>
      <div class="score-value">${p.score}</div>
    `;
    if (show) {
      (side === 'left' ? leftEl : rightEl).appendChild(chip);
    } else {
      fallback.appendChild(chip.cloneNode(true));
    }
  });
}

function findQ(state, ref) {
  const jp = state.games.jeopardy;
  const board = ref.round === 2 ? jp.round2 : jp.round1;
  const cat = board.find(c => c.id === ref.catId);
  if (!cat) return null;
  const q = cat.questions.find(q => q.id === ref.qId);
  if (!q) return null;
  return { cat, q };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
