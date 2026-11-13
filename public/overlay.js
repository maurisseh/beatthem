let lastState = null;
let boardLayer = null;
let questionLayer = null;
let roundBadge = null;

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

  roundBadge.textContent = 'RUNDE ' + jp.round + (jp.round === 2 ? ' — DOPPELTE PUNKTE' : '');

  Stage.update(state); // Logo-PNG, Avatare, Host-Facecam, Blinken des aktiven Spielers
  renderBoard(state);
  renderQuestion(state);
}

function renderBoard(state) {
  const jp = state.games.jeopardy;
  const board = currentBoard(state);

  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';
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
  boardLayer.innerHTML = '';
  boardLayer.appendChild(wrap);

  // Bei offener Frage bleibt das Board sichtbar, aber weichgezeichnet
  Stage.setBlur(boardLayer, !!jp.activeQuestion);
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
    <div class="question-text">${escapeHtml(q.question || '(Keine Frage hinterlegt)')}</div>
    ${jp.showAnswer ? `<div class="answer-text">${escapeHtml(q.answer || '(Keine Antwort hinterlegt)')}</div>` : ''}
  `;
  questionLayer.appendChild(card);
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
