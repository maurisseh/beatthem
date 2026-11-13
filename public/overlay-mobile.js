// 9:16-Overlay (1080 x 1920) für TikTok-Clips — Facecam oben, Frage in der Mitte, unten nur Spieler-Icons.
// Optional: overlay-mobile.html?scores=1 zeigt unter den Icons zusätzlich Name + Punktestand.

const SHOW_SCORES = new URLSearchParams(location.search).get('scores') === '1';
const MAX_PLAYERS = 4;

const stageEl = document.getElementById('stage');
const camEl = document.getElementById('m-cam');
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

// ---------- Spieler-Icons (bleiben bestehen, damit das Blinken nicht neu startet) ----------
const slots = [];
for (let i = 0; i < MAX_PLAYERS; i++) {
  const slot = document.createElement('div');
  slot.className = 'stage-slot hidden';
  const avatar = document.createElement('div');
  avatar.className = 'stage-avatar';
  const img = document.createElement('img');
  img.alt = '';
  img.className = 'hidden';
  const ph = document.createElement('span');
  ph.className = 'stage-avatar-ph';
  ph.textContent = '?';
  avatar.append(img, ph);
  slot.appendChild(avatar);

  let name = null, score = null;
  if (SHOW_SCORES) {
    const plate = document.createElement('div');
    plate.className = 'stage-plate';
    name = document.createElement('span');
    name.className = 'stage-plate-name';
    score = document.createElement('span');
    score.className = 'stage-plate-score';
    plate.append(name, score);
    slot.appendChild(plate);
  }
  playersEl.appendChild(slot);
  slots.push({ slot, img, ph, name, score });
}

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
  const activeId = state.activePlayerId || null;
  const someoneActive = !!activeId && players.some(p => p.id === activeId);
  slots.forEach((sl, i) => {
    const p = players[i];
    if (!p) { sl.slot.classList.add('hidden'); return; }
    sl.slot.classList.remove('hidden');
    sl.slot.style.setProperty('--player-color', p.color || '#f5c518');
    sl.slot.classList.toggle('is-active', p.id === activeId);
    sl.slot.classList.toggle('is-dimmed', someoneActive && p.id !== activeId);
    setImg(sl.img, p.avatar || '');
    sl.ph.classList.toggle('hidden', !!p.avatar);
    if (sl.name) { sl.name.textContent = p.name || ''; sl.score.textContent = p.score; }
  });
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
    // Ruhezustand: Logo (falls gesetzt) + Brettname
    const idle = document.createElement('div');
    idle.className = 'm-idle';
    if (state.settings.logoImage) {
      const logo = document.createElement('img');
      logo.className = 'm-logo';
      logo.src = state.settings.logoImage;
      logo.alt = '';
      idle.appendChild(logo);
    }
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
  const fs = text.length > 220 ? 36 : text.length > 150 ? 42 : text.length > 90 ? 48 : 56;
  const lines = Math.ceil((text.length * fs * 0.5) / 920);
  const textH = text ? lines * fs * 1.25 : 0;
  const avail = 740 - 64 - 48 - (jp.showAnswer ? 76 : 0) - 54 - textH;
  const imgH = Math.max(160, Math.min(520, Math.floor(avail)));

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
  camEl.classList.toggle('hidden', state.settings.showModeratorCam === false);
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
