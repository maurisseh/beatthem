let lastState = null;
let activeTab = 'board';

// ---------------- Login ----------------

window.onAuthLost = function () {
  document.getElementById('app-root').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-error').textContent = 'Sitzung abgelaufen — bitte erneut anmelden.';
};

async function doLogin() {
  const pw = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    const data = await res.json();
    if (data.ok) {
      localStorage.setItem('modToken', data.token);
      startApp();
    } else {
      errEl.textContent = data.error || 'Anmeldung fehlgeschlagen.';
    }
  } catch (e) {
    errEl.textContent = 'Verbindung zum Server fehlgeschlagen.';
  }
}

async function checkExistingLogin() {
  const token = localStorage.getItem('modToken');
  if (!token) return;
  try {
    const res = await fetch('/api/validate', { headers: { 'x-auth-token': token } });
    const data = await res.json();
    if (data.ok) startApp();
  } catch (e) {
    // Server evtl. noch nicht erreichbar — Login-Screen bleibt sichtbar
  }
}

function startApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-root').classList.remove('hidden');
  connectLiveState((state) => {
    lastState = state;
    applyThemeColors(state.settings);
    applyGlowSettings(state.settings);
    renderRoundButtons(state);
    if (activeTab === 'board') renderBoardTab(state);
    if (activeTab === 'setup') renderSetupTab(state);
    if (activeTab === 'players') renderPlayersTab(state);
    if (activeTab === 'settings') renderSettingsTab(state);
  });
}

checkExistingLogin();

// ---------------- Backup Export/Import ----------------

async function exportState() {
  const res = await fetch('/api/state');
  const state = await res.json();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `beat-the-m-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importState(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!confirm('Aktuellen Spielstand mit dieser Backup-Datei überschreiben?')) return;
      await sendAction('IMPORT_STATE', data);
    } catch (e) {
      alert('Datei konnte nicht gelesen werden — ist es eine gültige Backup-JSON-Datei?');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ---------------- Tabs ----------------

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  if (lastState) {
    if (tab === 'board') renderBoardTab(lastState);
    if (tab === 'setup') renderSetupTab(lastState);
    if (tab === 'players') renderPlayersTab(lastState);
    if (tab === 'settings') renderSettingsTab(lastState);
  }
}

function renderRoundButtons(state) {
  const jp = state.games.jeopardy;
  document.getElementById('round1-btn').classList.toggle('active', jp.round === 1);
  document.getElementById('round2-btn').classList.toggle('active', jp.round === 2);
}

function setRound(round) {
  sendAction('SET_ROUND', { round });
}

// ---------------- Board-Tab ----------------

function renderBoardTab(state) {
  const jp = state.games.jeopardy;
  const area = document.getElementById('mod-board-area');
  area.innerHTML = '';
  renderTurnBar(state);

  if (jp.activeQuestion) {
    const ref = jp.activeQuestion;
    const board = ref.round === 2 ? jp.round2 : jp.round1;
    const cat = board.find(c => c.id === ref.catId);
    const q = cat ? cat.questions.find(q => q.id === ref.qId) : null;
    if (!q) { area.innerHTML = '<p>Frage nicht gefunden.</p>'; return; }

    const panel = document.createElement('div');
    panel.className = 'question-panel';
    panel.innerHTML = `
      <div class="question-card">
        <div class="question-value">${cat.name} — ${q.value} Punkte</div>
        <div class="question-text">${escapeHtml(q.question || '(Keine Frage hinterlegt — im Tab "Fragen & Kategorien" ausfüllen)')}</div>
        ${jp.showAnswer ? `<div class="answer-text">${escapeHtml(q.answer || '(Keine Antwort hinterlegt)')}</div>` : ''}
      </div>
      <div class="controls-row">
        <button class="btn-primary" onclick="sendAction('TOGGLE_ANSWER')">${jp.showAnswer ? 'Antwort verbergen' : 'Antwort anzeigen'}</button>
        <button class="btn-secondary" onclick="markAnsweredAndClose('${ref.round}','${ref.catId}','${ref.qId}')">Als beantwortet markieren &amp; schließen</button>
        <button class="btn-secondary" onclick="sendAction('CLOSE_QUESTION')">Nur schließen (offen lassen)</button>
      </div>
      <div class="assign-points" id="assign-points"></div>
    `;
    area.appendChild(panel);
    renderAssignPoints(state, q.value);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';
  const grid = document.createElement('div');
  grid.className = 'board-grid';
  const board = currentBoard(state);

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
      cell.className = 'cell' + (q.answered ? ' answered' : ' clickable');
      cell.textContent = q.value;
      if (!q.answered) {
        cell.onclick = () => sendAction('OPEN_QUESTION', { round: jp.round, catId: cat.id, qId: q.id });
      }
      grid.appendChild(cell);
    });
  }

  wrap.appendChild(grid);
  area.appendChild(wrap);
}

function renderAssignPoints(state, questionValue) {
  const el = document.getElementById('assign-points');
  el.innerHTML = '<h3>Punkte vergeben</h3>';
  state.players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'assign-row';
    row.innerHTML = `
      <div class="name" style="color:${p.color}">${escapeHtml(p.name)}</div>
      <button class="btn-secondary" onclick="sendAction('ADJUST_SCORE',{id:'${p.id}',delta:${questionValue}})">+${questionValue}</button>
      <button class="btn-danger" onclick="sendAction('ADJUST_SCORE',{id:'${p.id}',delta:${-questionValue}})">−${questionValue}</button>
      <span style="min-width:50px; text-align:center; font-family:'Bebas Neue'; font-size:18px; color:var(--color-secondary);">${p.score}</span>
    `;
    el.appendChild(row);
  });
}

function markAnsweredAndClose(round, catId, qId) {
  sendAction('MARK_ANSWERED', { round: Number(round), catId, qId, answered: true });
  sendAction('CLOSE_QUESTION');
}

// ---------------- Setup-Tab ----------------

function renderSetupTab(state) {
  const jp = state.games.jeopardy;
  const grid = document.getElementById('setup-grid');
  grid.innerHTML = '';
  const board = currentBoard(state);

  board.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'setup-cat';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'cat-name';
    nameInput.value = cat.name;
    nameInput.placeholder = 'Kategoriename';
    nameInput.onchange = () => sendAction('EDIT_CATEGORY_NAME', { round: jp.round, catId: cat.id, name: nameInput.value });
    card.appendChild(nameInput);

    cat.questions.forEach(q => {
      const qWrap = document.createElement('div');
      qWrap.className = 'setup-q';

      const valueLabel = document.createElement('div');
      valueLabel.className = 'q-value';
      valueLabel.textContent = q.value + ' Punkte';
      qWrap.appendChild(valueLabel);

      const qInput = document.createElement('textarea');
      qInput.placeholder = 'Frage...';
      qInput.value = q.question;
      qInput.onchange = () => sendAction('EDIT_QUESTION', { round: jp.round, catId: cat.id, qId: q.id, question: qInput.value });
      qWrap.appendChild(qInput);

      const aInput = document.createElement('textarea');
      aInput.placeholder = 'Antwort...';
      aInput.value = q.answer;
      aInput.style.minHeight = '32px';
      aInput.onchange = () => sendAction('EDIT_QUESTION', { round: jp.round, catId: cat.id, qId: q.id, answer: aInput.value });
      qWrap.appendChild(aInput);

      card.appendChild(qWrap);
    });

    grid.appendChild(card);
  });
}

// ---------------- Players-Tab ----------------

function renderPlayersTab(state) {
  const list = document.getElementById('players-list');
  list.innerHTML = '';
  state.players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'player-card';
    const thumb = p.avatar
      ? `<img src="${escapeAttr(p.avatar)}" alt="">`
      : '<span>?</span>';
    card.innerHTML = `
      <div class="avatar-thumb" style="--pc:${p.color}">${thumb}</div>
      <input type="color" value="${p.color}" onchange="sendAction('UPDATE_PLAYER',{id:'${p.id}',color:this.value})">
      <input type="text" value="${escapeAttr(p.name)}" onchange="sendAction('UPDATE_PLAYER',{id:'${p.id}',name:this.value})">
      <label class="btn-secondary avatar-btn" title="Avatar hochladen">🖼 Avatar
        <input type="file" accept="image/*" class="hidden" onchange="onAvatarFile(event,'${p.id}')">
      </label>
      ${p.avatar ? `<button class="btn-icon" title="Avatar entfernen" onclick="sendAction('UPDATE_PLAYER',{id:'${p.id}',avatar:''})">✕</button>` : ''}
      <div class="player-score-controls">
        <button class="btn-icon" onclick="sendAction('ADJUST_SCORE',{id:'${p.id}',delta:-100})">−100</button>
        <button class="btn-icon" onclick="sendAction('ADJUST_SCORE',{id:'${p.id}',delta:-10})">−10</button>
        <span>${p.score}</span>
        <button class="btn-icon" onclick="sendAction('ADJUST_SCORE',{id:'${p.id}',delta:10})">+10</button>
        <button class="btn-icon" onclick="sendAction('ADJUST_SCORE',{id:'${p.id}',delta:100})">+100</button>
      </div>
      <button class="btn-danger" onclick="if(confirm('Spieler entfernen?')) sendAction('REMOVE_PLAYER',{id:'${p.id}'})">✕</button>
    `;
    list.appendChild(card);
  });
}

function addPlayer() {
  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  sendAction('ADD_PLAYER', { name: 'Neuer Spieler', color });
}

// ---------------- Settings-Tab ----------------

function renderSettingsTab(state) {
  const s = state.settings;
  document.getElementById('primaryColor').value = s.primaryColor;
  document.getElementById('secondaryColor').value = s.secondaryColor;
  document.getElementById('boardTextColor').value = s.boardTextColor;
  document.getElementById('showModeratorCam').checked = s.showModeratorCam !== false;
  const logoPrev = document.getElementById('logo-preview');
  logoPrev.innerHTML = s.logoImage
    ? `<img src="${escapeAttr(s.logoImage)}" alt="">`
    : '<span class="hint">kein Logo</span>';

  document.getElementById('glowEnabled').checked = s.glowEnabled !== false;
  document.getElementById('glowColor').value = s.glowColor || '#f5c518';
  document.getElementById('glowBlur').value = s.glowBlur ?? 18;
  document.getElementById('glowBlurVal').textContent = s.glowBlur ?? 18;
  document.getElementById('glowIntensity').value = s.glowIntensity ?? 70;
  document.getElementById('glowIntensityVal').textContent = s.glowIntensity ?? 70;

  const preview = document.getElementById('bg-preview');
  preview.style.backgroundImage = s.backgroundImage ? `url("${s.backgroundImage}")` : 'none';
  preview.style.background = s.backgroundImage ? preview.style.backgroundImage : '#0d0f26';
  if (s.backgroundImage) {
    preview.style.backgroundSize = 'cover';
    preview.style.backgroundPosition = 'center';
  }

  const link = document.getElementById('overlay-link');
  const url = window.location.origin + '/overlay.html';
  link.innerHTML = `<a href="${url}" target="_blank">${url}</a>`;
}

function updateSetting(key, value) {
  sendAction('SET_SETTINGS', { [key]: value });
}

function onBgFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    updateSetting('backgroundImage', reader.result);
  };
  reader.readAsDataURL(file);
}

// ---------------- Wer ist dran? ----------------

function renderTurnBar(state) {
  const bar = document.getElementById('turn-bar');
  bar.innerHTML = '<span class="turn-label">Wer ist dran?</span>';
  state.players.forEach(p => {
    const btn = document.createElement('button');
    const isActive = state.activePlayerId === p.id;
    btn.className = 'turn-btn' + (isActive ? ' active' : '');
    btn.style.setProperty('--pc', p.color);
    btn.textContent = p.name;
    btn.onclick = () => sendAction('SET_ACTIVE_PLAYER', { id: isActive ? null : p.id });
    bar.appendChild(btn);
  });
  const none = document.createElement('button');
  none.className = 'btn-secondary';
  none.style.padding = '7px 14px';
  none.textContent = 'Niemand';
  none.onclick = () => sendAction('SET_ACTIVE_PLAYER', { id: null });
  bar.appendChild(none);
}

// ---------------- Logo & Avatare (Bild einlesen + verkleinern) ----------------

// Transparenz (PNG) bleibt erhalten. Pixel-Art wird beim Verkleinern nicht weichgezeichnet.
function readImage(file, maxW, maxH, pixelArt) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        if (scale === 1 && file.type === 'image/png') return resolve(reader.result);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = !pixelArt;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function onLogoFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    updateSetting('logoImage', await readImage(file, 1200, 300, false));
  } catch (e) {
    alert('Bild konnte nicht gelesen werden.');
  }
  event.target.value = '';
}

async function onAvatarFile(event, playerId) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = await readImage(file, 512, 512, true);
    sendAction('UPDATE_PLAYER', { id: playerId, avatar: data });
  } catch (e) {
    alert('Bild konnte nicht gelesen werden.');
  }
  event.target.value = '';
}

// ---------------- Utils ----------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}
