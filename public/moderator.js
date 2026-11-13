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
    renderBoardSelect(state);
    if (activeTab === 'board') renderBoardTab(state);
    if (activeTab === 'setup') renderSetupTab(state);
    if (activeTab === 'players') renderPlayersTab(state);
    if (activeTab === 'settings') renderSettingsTab(state);
  });
}

checkExistingLogin();

// ---------------- Backup Export/Import ----------------

async function exportState() {
  const res = await fetch('/api/state?full=1'); // inkl. Bilder
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

// ---------------- Bretter ----------------

let editBoardId = null;      // Brett, das im Tab "Fragen & Kategorien" bearbeitet wird (unabhängig vom Live-Brett)
let pendingEditBoardId = null;

function renderBoardSelect(state) {
  const jp = state.games.jeopardy;
  const sel = document.getElementById('board-select');
  sel.innerHTML = '';
  jp.boards.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    opt.selected = b.id === jp.activeBoardId;
    sel.appendChild(opt);
  });
}

function setActiveBoard(boardId) {
  sendAction('SET_ACTIVE_BOARD', { boardId });
}

function resetBoard(boardId) {
  if (confirm('Dieses Brett zurücksetzen (alle Fragen wieder offen)?')) sendAction('RESET_BOARD', { boardId });
}

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'b-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------------- Board-Tab ----------------

function renderBoardTab(state) {
  const jp = state.games.jeopardy;
  const board = currentBoard(state);
  const area = document.getElementById('mod-board-area');
  area.innerHTML = '';
  renderTurnBar(state);

  // Werkzeugzeile: Brettname, Fortschritt, Zurücksetzen
  let total = 0, done = 0;
  board.categories.forEach(c => c.questions.forEach(q => { total++; if (q.answered) done++; }));
  const tools = document.getElementById('board-tools');
  tools.innerHTML = `<span>Brett: <b>${escapeHtml(board.name)}</b> · ${done}/${total} abgehakt</span>
    <button class="btn-secondary" style="padding:5px 12px;font-size:12px;" onclick="resetBoard('${board.id}')">↺ Dieses Brett zurücksetzen</button>`;

  if (jp.activeQuestion) {
    const ref = jp.activeQuestion;
    const refBoard = jp.boards.find(b => b.id === ref.boardId);
    const cat = refBoard ? refBoard.categories.find(c => c.id === ref.catId) : null;
    const q = cat ? cat.questions.find(q => q.id === ref.qId) : null;
    if (!q) { area.innerHTML = '<p>Frage nicht gefunden.</p>'; return; }

    const panel = document.createElement('div');
    panel.className = 'question-panel';
    panel.innerHTML = `
      <div class="question-card">
        <div class="question-value">${escapeHtml(cat.name)} — ${q.value} Punkte</div>
        <div class="question-text">${escapeHtml(q.question || (q.mediaType === 'image' ? '' : '(Keine Frage hinterlegt — im Tab "Fragen & Kategorien" ausfüllen)'))}</div>
        ${q.mediaType === 'image' ? `<img class="mod-q-img" src="${questionImageUrl(q)}" alt="">` : ''}
        ${jp.showAnswer ? `<div class="answer-text">${escapeHtml(q.answer || '(Keine Antwort hinterlegt)')}</div>` : ''}
      </div>
      <div class="controls-row">
        <button class="btn-primary" onclick="sendAction('TOGGLE_ANSWER')">${jp.showAnswer ? 'Antwort verbergen' : 'Antwort anzeigen'}</button>
        <button class="btn-secondary" onclick="markAnsweredAndClose('${ref.boardId}','${ref.catId}','${ref.qId}')">Als beantwortet markieren &amp; schließen</button>
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
  const cats = board.categories;
  const rows = Math.max(1, ...cats.map(c => c.questions.length));
  grid.style.gridTemplateColumns = `repeat(${cats.length}, 1fr)`;

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
      cell.className = 'cell' + (q.answered ? ' answered' : ' clickable');
      cell.textContent = q.value;
      if (!q.answered) {
        cell.onclick = () => sendAction('OPEN_QUESTION', { boardId: board.id, catId: cat.id, qId: q.id });
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

async function markAnsweredAndClose(boardId, catId, qId) {
  await sendAction('MARK_ANSWERED', { boardId, catId, qId, answered: true });
  await sendAction('CLOSE_QUESTION'); // löst ggf. automatisch die Gewinner-Animation aus
}

// ---------------- Setup-Tab ----------------

const MAX_CATEGORIES = 8;

function editedBoard(state) {
  const jp = state.games.jeopardy;
  if (pendingEditBoardId && jp.boards.some(b => b.id === pendingEditBoardId)) {
    editBoardId = pendingEditBoardId;
    pendingEditBoardId = null;
  }
  if (!jp.boards.some(b => b.id === editBoardId)) editBoardId = jp.activeBoardId;
  return jp.boards.find(b => b.id === editBoardId);
}

function renderSetupTab(state) {
  const jp = state.games.jeopardy;
  const board = editedBoard(state);

  // ----- Werkzeugleiste: Brett wählen / benennen / Punktwerte / neu / löschen -----
  const tb = document.getElementById('board-toolbar');
  tb.innerHTML = `
    <div class="tb-group" style="flex:1 1 200px;">
      <label>Brett bearbeiten</label>
      <select id="edit-board-select">
        ${jp.boards.map(b => `<option value="${b.id}" ${b.id === board.id ? 'selected' : ''}>${escapeHtml(b.name)}${b.id === jp.activeBoardId ? ' (live)' : ''}</option>`).join('')}
      </select>
    </div>
    <div class="tb-group" style="flex:1 1 180px;">
      <label>Name des Bretts</label>
      <input type="text" id="board-name" value="${escapeAttr(board.name)}">
    </div>
    <div class="tb-group" style="flex:1 1 220px;">
      <label>Punktwerte (= Zeilen, 1–8)</label>
      <input type="text" id="board-values" value="${board.values.join(', ')}" title="z. B. 100, 200, 300, 400, 500">
    </div>
    <div class="tb-group tb-actions">
      <button class="btn-primary" id="board-live-btn" ${board.id === jp.activeBoardId ? 'disabled style="opacity:.4;cursor:default"' : ''}>▶ Live schalten</button>
      <button class="btn-secondary" id="board-new-btn">＋ Neues Brett</button>
      <button class="btn-danger" id="board-del-btn" ${jp.boards.length <= 1 ? 'disabled style="opacity:.4;cursor:default"' : ''}>Löschen</button>
    </div>`;

  document.getElementById('edit-board-select').onchange = (e) => { editBoardId = e.target.value; renderSetupTab(lastState); };
  document.getElementById('board-name').onchange = (e) => sendAction('RENAME_BOARD', { boardId: board.id, name: e.target.value });
  document.getElementById('board-values').onchange = (e) => {
    const values = e.target.value.split(/[,;\s]+/).map(Number).filter(n => Number.isFinite(n) && n >= 0);
    if (!values.length || values.length > 8) { alert('Bitte 1 bis 8 Punktwerte angeben, z. B. 100, 200, 300, 400, 500'); renderSetupTab(lastState); return; }
    if (values.length < board.values.length) {
      const lost = board.categories.some(c => c.questions.slice(values.length).some(q => q.question || q.answer || q.mediaType === 'image'));
      if (lost && !confirm('Es gibt dann weniger Zeilen — befüllte Fragen in den letzten Zeilen gehen verloren. Fortfahren?')) { renderSetupTab(lastState); return; }
    }
    sendAction('SET_BOARD_VALUES', { boardId: board.id, values });
  };
  document.getElementById('board-live-btn').onclick = () => sendAction('SET_ACTIVE_BOARD', { boardId: board.id });
  document.getElementById('board-new-btn').onclick = () => {
    const name = prompt('Name des neuen Bretts:', 'Brett ' + (jp.boards.length + 1));
    if (name === null) return;
    const id = newId();
    pendingEditBoardId = id;
    sendAction('ADD_BOARD', { id, name: name.trim() || undefined, values: board.values });
  };
  document.getElementById('board-del-btn').onclick = () => {
    if (jp.boards.length <= 1) return;
    if (confirm(`Brett „${board.name}“ mit allen Fragen wirklich löschen?`)) sendAction('DELETE_BOARD', { boardId: board.id });
  };

  // ----- Kategorienanzahl -----
  const stepper = document.getElementById('cat-stepper');
  stepper.innerHTML = `
    <span style="font-weight:700;">Kategorien (${escapeHtml(board.name)}):</span>
    <button class="btn-icon" id="cat-minus" title="Letzte Kategorie entfernen" ${board.categories.length <= 1 ? 'disabled' : ''}>−</button>
    <span class="count">${board.categories.length}</span>
    <button class="btn-icon" id="cat-plus" title="Kategorie hinzufügen" ${board.categories.length >= MAX_CATEGORIES ? 'disabled' : ''}>+</button>
    <span class="hint" style="margin:0;">min. 1, max. ${MAX_CATEGORIES}</span>
  `;
  document.getElementById('cat-plus').onclick = () => sendAction('ADD_CATEGORY', { boardId: board.id });
  document.getElementById('cat-minus').onclick = () => {
    const last = board.categories[board.categories.length - 1];
    const hasContent = last.questions.some(q => q.question || q.answer || q.mediaType === 'image');
    if (hasContent && !confirm(`Kategorie „${last.name}“ enthält Fragen. Wirklich entfernen?`)) return;
    sendAction('REMOVE_CATEGORY', { boardId: board.id, catId: last.id });
  };

  // ----- Kategorie-Karten -----
  const grid = document.getElementById('setup-grid');
  grid.innerHTML = '';

  board.categories.forEach((cat, ci) => {
    const card = document.createElement('div');
    card.className = 'setup-cat';

    const head = document.createElement('div');
    head.className = 'cat-head';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'cat-name';
    nameInput.value = cat.name;
    nameInput.placeholder = 'Kategoriename';
    nameInput.onchange = () => sendAction('EDIT_CATEGORY_NAME', { boardId: board.id, catId: cat.id, name: nameInput.value });
    head.appendChild(nameInput);

    // Bilder-Stapel: mehrere Bilder wählen -> füllen die Fragen der Kategorie der Reihe nach
    const stackLabel = document.createElement('label');
    stackLabel.className = 'btn-secondary avatar-btn';
    stackLabel.title = 'Mehrere Bilder wählen: jedes Bild wird eine Frage (Antwort = Dateiname)';
    stackLabel.style.cssText = 'padding:4px 10px;font-size:12px;white-space:nowrap;';
    stackLabel.textContent = '🖼 Bilder-Stapel';
    const stackInput = document.createElement('input');
    stackInput.type = 'file'; stackInput.multiple = true; stackInput.accept = 'image/*'; stackInput.className = 'hidden';
    stackInput.onchange = () => fillCategoryWithImages(board, ci, [...stackInput.files]).finally(() => { stackInput.value = ''; });
    stackLabel.appendChild(stackInput);
    head.appendChild(stackLabel);
    card.appendChild(head);

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
      qInput.onchange = () => sendAction('EDIT_QUESTION', { boardId: board.id, catId: cat.id, qId: q.id, question: qInput.value });
      qWrap.appendChild(qInput);

      const aInput = document.createElement('textarea');
      aInput.placeholder = 'Antwort...';
      aInput.value = q.answer;
      aInput.style.minHeight = '32px';
      aInput.onchange = () => sendAction('EDIT_QUESTION', { boardId: board.id, catId: cat.id, qId: q.id, answer: aInput.value });
      qWrap.appendChild(aInput);

      // Bild zur Frage
      const media = document.createElement('div');
      media.className = 'q-media';
      if (q.mediaType === 'image') {
        const im = document.createElement('img');
        im.src = questionImageUrl(q);
        im.alt = '';
        const nm = document.createElement('span');
        nm.className = 'mname';
        nm.textContent = q.mediaName || 'Bild';
        const rm = document.createElement('button');
        rm.className = 'btn-icon';
        rm.style.cssText = 'width:24px;height:24px;font-size:12px;';
        rm.title = 'Bild entfernen';
        rm.textContent = '✕';
        rm.onclick = () => sendAction('EDIT_QUESTION_MEDIA', { boardId: board.id, catId: cat.id, qId: q.id, mediaType: 'none', mediaData: '' });
        media.append(im, nm, rm);
      }
      const upLabel = document.createElement('label');
      upLabel.className = 'btn-secondary avatar-btn';
      upLabel.style.cssText = 'padding:3px 9px;font-size:12px;';
      upLabel.textContent = q.mediaType === 'image' ? '🖼 ändern' : '🖼 Bild';
      const upInput = document.createElement('input');
      upInput.type = 'file'; upInput.accept = 'image/*'; upInput.className = 'hidden';
      upInput.onchange = async () => {
        const f = upInput.files[0];
        if (!f) return;
        try {
          const img = await readQuestionImage(f);
          sendAction('EDIT_QUESTION_MEDIA', { boardId: board.id, catId: cat.id, qId: q.id, mediaType: 'image', mediaData: img.dataUrl, mediaName: img.name });
        } catch (e) { alert('Bild konnte nicht gelesen werden.'); }
        upInput.value = '';
      };
      upLabel.appendChild(upInput);
      media.appendChild(upLabel);
      qWrap.appendChild(media);

      card.appendChild(qWrap);
    });

    grid.appendChild(card);
  });
}

// ---------------- Bilder für Fragen ----------------

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => resolve(img);
    img.src = src;
  });
}

// Verkleinert auf max. 800 × 600 und hält die Datei klein (Flaggen/Logos bleiben PNG mit Transparenz,
// Fotos werden JPEG). Das Bild liegt später einzeln auf dem Server, nicht im Live-State.
async function readQuestionImage(file) {
  const img = await loadImage(await fileToDataUrl(file));
  let w = img.naturalWidth || 800, h = img.naturalHeight || 533;
  const scale = Math.min(1, 800 / w, 600 / h);
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const draw = (white) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (white) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    return c;
  };
  const pngLike = /png|svg|gif|webp/i.test(file.type);
  let out = pngLike ? draw(false).toDataURL('image/png') : draw(true).toDataURL('image/jpeg', 0.85);
  if (pngLike && out.length > 400000) out = draw(true).toDataURL('image/jpeg', 0.85); // zu groß -> JPEG
  return { name: file.name, dataUrl: out };
}

// "south_africa.png" -> "South Africa"
function prettyName(filename) {
  let n = filename.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (n === n.toLowerCase()) n = n.replace(/\b\p{L}/gu, c => c.toUpperCase());
  return n;
}

function naturalSort(files) {
  return files.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

// Bilder-Stapel: jedes Bild -> eine Frage der Kategorie (Antwort = Dateiname, Fragetext frei wählbar)
async function fillCategoryWithImages(board, catIndex, files) {
  if (!files.length) return;
  const cat = board.categories[catIndex];
  const rows = cat.questions.length;
  const existing = (cat.questions.find(q => q.question) || {}).question;
  const text = prompt(`Fragetext für alle ${Math.min(files.length, rows)} Bilder der Kategorie „${cat.name}“\n(Die Antwort wird aus dem Dateinamen gebildet, z. B. deutschland.png → „Deutschland“):`, existing || 'Was ist das?');
  if (text === null) return;
  document.body.style.cursor = 'progress';
  try {
    const sorted = naturalSort(files).slice(0, rows);
    const questions = [];
    for (let i = 0; i < sorted.length; i++) {
      const img = await readQuestionImage(sorted[i]);
      questions.push({ k: catIndex + 1, f: i + 1, question: text, answer: prettyName(sorted[i].name), media: { name: img.name, dataUrl: img.dataUrl } });
    }
    await sendAction('IMPORT_BOARD', { boardId: board.id, replace: false, questions });
    if (files.length > rows) alert(`Die Kategorie hat nur ${rows} Fragen — ${files.length - rows} Bild(er) wurden nicht verwendet.\nTipp: Punktwerte oben um weitere Zeilen ergänzen.`);
  } catch (e) {
    alert('Bilder konnten nicht verarbeitet werden.');
  } finally {
    document.body.style.cursor = '';
  }
}

// ---------------- Text-Import ----------------

const importPool = new Map(); // normalisierter Name -> { name, dataUrl }

function normName(s) {
  return String(s).toLowerCase().replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}]+/gu, '');
}

function updatePoolInfo() {
  const el = document.getElementById('import-pool-info');
  if (!importPool.size) { el.textContent = 'Bilder-Pool: leer'; return; }
  const names = [...importPool.values()].map(v => v.name);
  el.textContent = `Bilder-Pool: ${names.length} Bild(er) — ${names.slice(0, 8).join(', ')}${names.length > 8 ? ' …' : ''}`;
}

async function onImportImages(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  document.body.style.cursor = 'progress';
  try {
    for (const f of files) {
      const img = await readQuestionImage(f);
      importPool.set(normName(f.name), { name: f.name, dataUrl: img.dataUrl });
    }
  } catch (e) {
    alert('Mindestens ein Bild konnte nicht gelesen werden.');
  }
  document.body.style.cursor = '';
  event.target.value = '';
  updatePoolInfo();
}

function clearImportPool() {
  importPool.clear();
  updatePoolInfo();
}

// Anführungszeichen-Paare, die als Feldbeginn erkannt werden (auch typografische)
const QUOTE_CLOSERS = {
  '"': ['"'], '„': ['“', '”', '"'], '“': ['”', '"'], '”': ['”', '"'],
  '«': ['»'], '»': ['«'], "'": ["'", '’'], '‘': ['’', "'"], '’': ['’', "'"]
};

// Zerlegt  "Frage" , "Antwort" , "bild.png"  in Felder. Kommas in Anführungszeichen sind erlaubt,
// "" ergibt ein Anführungszeichen, \n einen Zeilenumbruch.
function parseFields(str) {
  const fields = [];
  const n = str.length;
  let i = 0;
  while (i < n) {
    while (i < n && /\s/.test(str[i])) i++;
    if (i >= n) break;
    let val = '';
    const ch = str[i];
    if (QUOTE_CLOSERS[ch]) {
      const closers = QUOTE_CLOSERS[ch];
      i++;
      while (i < n) {
        if (ch === '"' && str[i] === '"' && str[i + 1] === '"') { val += '"'; i += 2; continue; } // "" -> "
        if (str[i] === '\\' && QUOTE_CLOSERS[str[i + 1]]) { val += str[i + 1]; i += 2; continue; }  // \" -> "
        if (closers.includes(str[i])) {
          let j = i + 1;
          while (j < n && /\s/.test(str[j])) j++;
          if (j >= n || str[j] === ',') { i = j; break; } // echtes Ende des Feldes
        }
        val += str[i];
        i++;
      }
      if (str[i] === ',') i++;
    } else {
      let j = str.indexOf(',', i);
      if (j === -1) j = n;
      val = str.slice(i, j).trim();
      i = j + 1;
    }
    fields.push(val.replace(/\\n/g, '\n'));
  }
  return fields;
}

function stripQuotes(s) {
  const f = parseFields(s.trim());
  return (f.length ? f[0] : s).trim();
}

function parseImportText(text, board) {
  const out = { boardName: null, categories: {}, questions: [], warnings: [], images: 0, usedPool: new Set() };
  const rows = Math.max(1, ...board.categories.map(c => c.questions.length));

  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    const no = idx + 1;
    if (!line || line.startsWith('#') || line.startsWith('//')) return;
    let m;

    if ((m = /^(?:BRETT|BOARD)\s*[:=]\s*(.+)$/i.exec(line))) { out.boardName = stripQuotes(m[1]); return; }

    if ((m = /^K\s*(\d+)\s*[:.\-]?\s*F\s*(\d+)\s*[:=\-]?\s*(.*)$/i.exec(line))) {
      const k = Number(m[1]), f = Number(m[2]);
      if (k < 1 || k > MAX_CATEGORIES) { out.warnings.push(`Zeile ${no}: Kategorie K${k} ist ungültig (erlaubt: 1–${MAX_CATEGORIES}).`); return; }
      if (f < 1 || f > rows) { out.warnings.push(`Zeile ${no}: F${f} gibt es nicht — das Brett hat ${rows} Fragen pro Kategorie (Punktwerte oben ändern).`); return; }
      const fields = parseFields(m[3]);
      if (!fields.length || (fields.length === 1 && !fields[0])) { out.warnings.push(`Zeile ${no}: K${k}:F${f} enthält keine Frage.`); return; }
      const item = { k, f, question: fields[0], answer: fields.length > 1 ? fields[1] : undefined };
      const ref = fields.length > 2 ? fields[2].trim() : '';
      if (ref) {
        const hit = importPool.get(normName(ref));
        const existing = (((board.categories[k - 1] || {}).questions || [])[f - 1]) || null;
        if (hit) {
          item.media = { name: hit.name, dataUrl: hit.dataUrl };
          out.usedPool.add(normName(ref));
          out.images++;
        } else if (existing && existing.mediaType === 'image' &&
                   (normName(existing.mediaName || '') === normName(ref) || /^bild-?k\d+f\d+$/i.test(ref.replace(/\.[^.]+$/, '')))) {
          // Bild ist schon am Brett (z. B. nach „Als Text laden“) -> behalten
        } else {
          out.warnings.push(`Zeile ${no}: Bild „${ref}“ ist nicht im Bilder-Pool (oben „Bilder hinzufügen“).`);
        }
      }
      out.questions.push(item);
      return;
    }

    if ((m = /^K\s*(\d+)\s*[:=\-]\s*(.+)$/i.exec(line))) {
      const k = Number(m[1]);
      if (k < 1 || k > MAX_CATEGORIES) { out.warnings.push(`Zeile ${no}: Kategorie K${k} ist ungültig (erlaubt: 1–${MAX_CATEGORIES}).`); return; }
      out.categories[k] = stripQuotes(m[2]);
      return;
    }

    out.warnings.push(`Zeile ${no}: nicht erkannt — „${line.slice(0, 60)}${line.length > 60 ? '…' : ''}“`);
  });
  return out;
}

async function runImport() {
  const board = editedBoard(lastState);
  const text = document.getElementById('import-text').value;
  const replace = document.getElementById('import-replace').checked;
  const resultEl = document.getElementById('import-result');

  if (!text.trim()) { resultEl.innerHTML = '<span class="warn">Bitte erst Text einfügen.</span>'; return; }
  const parsed = parseImportText(text, board);
  if (!parsed.questions.length && !Object.keys(parsed.categories).length && !parsed.boardName) {
    resultEl.innerHTML = '<span class="warn">Keine gültigen Zeilen erkannt.</span>' + renderWarnings(parsed.warnings);
    return;
  }
  if (replace && !confirm(`Brett „${board.name}“ wirklich komplett leeren und neu befüllen?`)) return;

  await sendAction('IMPORT_BOARD', {
    boardId: board.id,
    replace,
    boardName: parsed.boardName || undefined,
    categories: parsed.categories,
    questions: parsed.questions
  });

  const unused = [...importPool.keys()].filter(k => !parsed.usedPool.has(k)).length;
  resultEl.innerHTML =
    `<span class="ok">✓ ${parsed.questions.length} Frage(n) übernommen</span>` +
    ` · ${Object.keys(parsed.categories).length} Kategorienname(n)` +
    (parsed.images ? ` · ${parsed.images} Bild(er)` : '') +
    (unused ? ` · <span class="warn">${unused} Bild(er) im Pool nicht verwendet</span>` : '') +
    renderWarnings(parsed.warnings);
}

function renderWarnings(list) {
  if (!list.length) return '';
  return `<div class="warn" style="margin-top:6px;">⚠ ${list.length} Hinweis(e):</div><ul class="warn">${list.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`;
}

const quoteField = (s) => '"' + String(s).replace(/"/g, '""').replace(/\r?\n/g, '\\n') + '"';

function boardToText(board) {
  const lines = [`BRETT: ${board.name}`, ''];
  board.categories.forEach((cat, ci) => {
    lines.push(`K${ci + 1}: ${cat.name}`);
    cat.questions.forEach((q, qi) => {
      if (!q.question && !q.answer && q.mediaType !== 'image') return;
      const fields = [q.question, q.answer];
      if (q.mediaType === 'image') fields.push(q.mediaName || `bild-K${ci + 1}F${qi + 1}`);
      lines.push(`K${ci + 1}:F${qi + 1}: ` + fields.map(quoteField).join(' , '));
    });
    lines.push('');
  });
  return lines.join('\n').trim() + '\n';
}

function loadBoardAsText() {
  const board = editedBoard(lastState);
  document.getElementById('import-text').value = boardToText(board);
  document.getElementById('import-result').innerHTML = '<span class="ok">Aktuelles Brett als Text geladen</span> — Bilder bleiben beim erneuten Import erhalten.';
}

function insertImportExample() {
  document.getElementById('import-text').value =
`BRETT: Mein erstes Brett

K1: Geografie
K1:F1: "Hauptstadt von Frankreich?" , "Paris"
K1:F2: "Längster Fluss der Erde?" , "Nil"
K1:F3: "Wie viele Kontinente gibt es?" , "7"

K2: Flaggen
K2:F1: "Welches Land ist das?" , "Deutschland" , "deutschland.png"
K2:F2: "Welches Land ist das?" , "Frankreich" , "frankreich.png"

# Zeilen mit # sind Kommentare. Kategorien, die es noch nicht gibt, werden automatisch angelegt.`;
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
  document.getElementById('autoWinner').checked = s.autoWinner !== false;
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
  const mUrl = window.location.origin + '/overlay-mobile.html';
  document.getElementById('overlay-mobile-link').innerHTML = `<a href="${mUrl}" target="_blank">${mUrl}</a>`;
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

  // Gewinner-Animation manuell starten / beenden
  const shown = !!state.games.jeopardy.winnerShown;
  const win = document.createElement('button');
  win.className = (shown ? 'btn-danger' : 'btn-primary') + ' winner-btn';
  win.textContent = shown ? 'Gewinner ausblenden' : '🏆 Gewinner anzeigen';
  win.onclick = () => sendAction(shown ? 'HIDE_WINNER' : 'SHOW_WINNER');
  bar.appendChild(win);
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
