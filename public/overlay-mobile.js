// 9:16-Overlay (1080 x 1920) für TikTok-Clips — Facecam oben, darunter durchgehend das Logo,
// in der Mitte die Frage, unten nur der Spieler, der gerade dran ist (Icon + Name).
// Optional: overlay-mobile.html?scores=1 zeigt unter dem Namen zusätzlich den Punktestand.

const SHOW_SCORES = new URLSearchParams(location.search).get('scores') === '1';
const MAX_PLAYERS = 4; // wie im Haupt-Overlay: nur die ersten 4 Spieler zählen

const stageEl = document.getElementById('stage');
const camEl = document.getElementById('m-cam');
const logoEl = document.getElementById('m-logo');
const middleEl = document.getElementById('m-middle');
const playersEl = document.getElementById('m-players');
const winnerEl = document.getElementById('m-winner');
const winnerContent = document.getElementById('m-winner-content');
const confettiCanvas = document.getElementById('m-confetti');
let winnerKey = null;
let confettiRaf = null;

// ---------- Bühne in jede Fenstergröße einpassen ----------
function fit() {
  const scale = Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
  const x = (window.innerWidth - 1080 * scale) / 2;
  const y = (window.innerHeight - 1920 * scale) / 2;
  stageEl.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}
window.addEventListener('resize', fit);
fit();

// ---------- Unten: nur der Spieler, der dran ist (Element bleibt bestehen, damit das Blinken nicht neu startet) ----------
const slot = document.createElement('div');
slot.className = 'stage-slot is-active hidden';
const avatarBox = document.createElement('div');
avatarBox.className = 'stage-avatar';
const avatarImg = document.createElement('img');
avatarImg.alt = '';
avatarImg.className = 'hidden';
const avatarPh = document.createElement('span');
avatarPh.className = 'stage-avatar-ph';
avatarPh.textContent = '?';
avatarBox.append(avatarImg, avatarPh);
const plate = document.createElement('div');
plate.className = 'stage-plate';
const plateName = document.createElement('span');
plateName.className = 'stage-plate-name';
plate.appendChild(plateName);
let plateScore = null;
if (SHOW_SCORES) {
  plateScore = document.createElement('span');
  plateScore.className = 'stage-plate-score';
  plate.appendChild(plateScore);
}
slot.append(avatarBox, plate);
playersEl.appendChild(slot);

function setImg(img, src) {
  if (src) {
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    img.classList.remove('hidden');
  } else {
    img.removeAttribute('src');
    img.classList.add('hidden');
  }
}

function renderPlayers(state) {
  const players = (state.players || []).slice(0, MAX_PLAYERS);
  const p = players.find(x => x.id === state.activePlayerId);
  if (!p) { slot.classList.add('hidden'); return; } // niemand dran -> unten bleibt es leer
  slot.classList.remove('hidden');
  slot.style.setProperty('--player-color', p.color || '#f5c518');
  setImg(avatarImg, p.avatar || '');
  avatarPh.classList.toggle('hidden', !!p.avatar);
  plateName.textContent = p.name || '';
  if (plateScore) plateScore.textContent = p.score;
}

// ---------- Mitte: Frage oder Ruhezustand ----------
function renderMiddle(state) {
  const jp = state.games.jeopardy;
  const board = currentBoard(state);
  middleEl.innerHTML = '';

  const ref = jp.activeQuestion;
  let q = null;
  if (ref) {
    const b = jp.boards.find(x => x.id === ref.boardId);
    const c = b && b.categories.find(x => x.id === ref.catId);
    q = c && c.questions.find(x => x.id === ref.qId);
  }

  if (!q) {
    // Ruhezustand: Brettname (das Logo steht ohnehin durchgehend unter der Cam)
    const idle = document.createElement('div');
    idle.className = 'm-idle';
    const name = document.createElement('div');
    name.className = 'm-board';
    name.textContent = board.name || '';
    idle.appendChild(name);
    middleEl.appendChild(idle);
    return;
  }

  // Schriftgröße an die Textlänge anpassen, Bild bekommt den Rest der Höhe
  const text = q.question || '';
  const hasImg = q.mediaType === 'image';
  const fs = text.length > 300 ? 32 : text.length > 220 ? 36 : text.length > 150 ? 42 : text.length > 90 ? 48 : 56;
  const lines = Math.ceil((text.length * fs * 0.5) / 920);
  const textH = text ? lines * fs * 1.25 : 0;
  const avail = 536 - 64 - 48 - (jp.showAnswer ? 76 : 0) - 54 - textH;
  const imgH = Math.max(140, Math.min(480, Math.floor(avail)));

  const card = document.createElement('div');
  card.className = 'question-card m-card';
  card.style.setProperty('--qfs', fs + 'px');
  card.style.setProperty('--imgh', imgH + 'px');
  card.innerHTML = `
    <div class="question-value">${q.value} PUNKTE</div>
    ${text ? `<div class="question-text">${escapeHtml(text)}</div>` : ''}
    ${hasImg ? `<img class="m-img" src="${questionImageUrl(q)}" alt="">` : ''}
    ${!text && !hasImg ? '<div class="question-text">(Keine Frage hinterlegt)</div>' : ''}
    ${jp.showAnswer ? `<div class="answer-text">${escapeHtml(q.answer || '(Keine Antwort hinterlegt)')}</div>` : ''}
  `;
  middleEl.appendChild(card);
}

// ---------- Gewinner (schlicht: Titel, großer Avatar, Konfetti) ----------
function renderWinner(state) {
  const jp = state.games.jeopardy;
  const players = state.players || [];
  if (!jp.winnerShown || players.length === 0) { hideWinner(); return; }

  const max = Math.max(...players.map(p => p.score));
  const winners = players.filter(p => p.score === max).slice(0, MAX_PLAYERS);
  const key = winners.map(w => w.id + ':' + w.score).join('|') + '#' + (jp.winnerTs || 0);
  if (key === winnerKey) return;
  winnerKey = key;

  const tie = winners.length > 1;
  winnerEl.style.setProperty('--wc', hexToRgbTriplet(winners[0].color));
  const sz = tie ? 200 : 400, nsz = tie ? 44 : 84, ssz = tie ? 34 : 52, cw = tie ? 230 : 900;

  winnerContent.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'mw-title';
  title.textContent = tie ? 'UNENTSCHIEDEN' : '🏆 GEWINNER 🏆';
  winnerContent.appendChild(title);

  const row = document.createElement('div');
  row.className = 'mw-row';
  winners.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'mw-card';
    card.style.animationDelay = (0.35 + i * 0.15) + 's';
    card.style.setProperty('--pc', p.color);
    card.style.setProperty('--sz', sz + 'px');
    card.style.setProperty('--nsz', nsz + 'px');
    card.style.setProperty('--ssz', ssz + 'px');
    card.style.setProperty('--cw', cw + 'px');

    const wrap = document.createElement('div');
    wrap.className = 'mw-wrap';
    const glow = document.createElement('div');
    glow.className = 'mw-glow';
    const av = document.createElement('div');
    av.className = 'mw-avatar';
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
    wrap.append(glow, av);

    const name = document.createElement('div');
    name.className = 'mw-name';
    name.textContent = p.name;
    const score = document.createElement('div');
    score.className = 'mw-score';
    score.textContent = p.score + ' PUNKTE';
    card.append(wrap, name, score);
    row.appendChild(card);
  });
  winnerContent.appendChild(row);

  winnerEl.classList.add('show');
  startConfetti([...winners.map(w => w.color), '#f5c518', '#ffffff', '#ffd966']);
}

function hideWinner() {
  if (winnerKey === null && !winnerEl.classList.contains('show')) return;
  winnerKey = null;
  winnerEl.classList.remove('show');
  setTimeout(() => { if (!winnerEl.classList.contains('show')) stopConfetti(); }, 700);
}

function startConfetti(colors) {
  stopConfetti();
  const ctx = confettiCanvas.getContext('2d');
  const W = confettiCanvas.width, H = confettiCanvas.height; // halbe Auflösung (wird per CSS vergrößert)
  const make = (initial, i) => ({
    x: Math.random() * W, y: initial ? -Math.random() * H : -20,
    w: 6 + Math.random() * 9, h: 10 + Math.random() * 12,
    vy: 1.6 + Math.random() * 3, vx: -1 + Math.random() * 2,
    rot: Math.random() * Math.PI * 2, vr: -0.15 + Math.random() * 0.3,
    sway: Math.random() * Math.PI * 2, color: colors[i % colors.length]
  });
  const parts = Array.from({ length: 120 }, (_, i) => make(true, i));
  (function frame() {
    ctx.clearRect(0, 0, W, H);
    parts.forEach((p, i) => {
      p.y += p.vy; p.sway += 0.05; p.x += p.vx + Math.sin(p.sway) * 0.9; p.rot += p.vr;
      if (p.y > H + 20) Object.assign(p, make(false, i));
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    confettiRaf = requestAnimationFrame(frame);
  })();
}

function stopConfetti() {
  if (confettiRaf) cancelAnimationFrame(confettiRaf);
  confettiRaf = null;
  confettiCanvas.getContext('2d').clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
}

// ---------- Rendern ----------
function render(state) {
  applyThemeColors(state.settings);
  applyGlowSettings(state.settings);
  // Facecam-Kontur: Farbe + Dicke einstellbar, Innenfläche (x 40, y 76, 1000 × 620) bleibt gleich
  const fw = Math.max(2, Math.min(40, Number(state.settings.camFrameWidth) || 16));
  camEl.style.left = (40 - fw) + 'px';
  camEl.style.top = (76 - fw) + 'px';
  camEl.style.width = (1000 + 2 * fw) + 'px';
  camEl.style.height = (620 + 2 * fw) + 'px';
  camEl.style.borderWidth = fw + 'px';
  camEl.style.borderRadius = (20 + fw) + 'px';
  camEl.style.borderColor = state.settings.camFrameColor || '';
  camEl.classList.toggle('hidden', state.settings.showModeratorCam === false);
  setImg(logoEl, state.settings.logoImage || ''); // Logo durchgehend unter der Cam
  renderMiddle(state);
  renderPlayers(state);
  renderWinner(state);
  stageEl.classList.toggle('winner-on', winnerEl.classList.contains('show'));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

connectLiveState(render);
