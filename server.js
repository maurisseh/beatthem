// Beat the M — modulare Gameshow-Plattform
// Läuft komplett ohne externe Pakete (nur Node-Bordmittel).
// Startet mit: node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const SHOWS_DIR = path.join(DATA_DIR, 'shows');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const MOD_PASSWORD = process.env.MOD_PASSWORD || 'admin123';
if (!process.env.MOD_PASSWORD) {
  console.log('⚠️  Kein MOD_PASSWORD gesetzt — verwende Standardpasswort "admin123".');
  console.log('   Für den Online-Betrieb unbedingt die Umgebungsvariable MOD_PASSWORD setzen!');
}

let validTokens = new Set();
function isAuthed(req) {
  const token = req.headers['x-auth-token'];
  return !!token && validTokens.has(token);
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SHOWS_DIR)) fs.mkdirSync(SHOWS_DIR, { recursive: true });

// ============================================================
// Default-State (modular: jedes Spiel lebt unter state.games.<id>)
// ============================================================

function uid() { return crypto.randomUUID(); }

function makeCategory(name, values) {
  return {
    id: uid(),
    name,
    questions: values.map(v => ({
      id: uid(),
      value: v,
      question: '',
      answer: '',
      answered: false,
      mediaType: 'none', // 'none' | 'image' | 'audio'
      mediaData: ''      // dataURL
    }))
  };
}

function defaultJeopardyCategories(values) {
  const names = ['Kategorie 1', 'Kategorie 2', 'Kategorie 3', 'Kategorie 4', 'Kategorie 5', 'Kategorie 6'];
  return names.map(n => makeCategory(n, values));
}

function defaultBeichtenCards(count) {
  const cards = [];
  for (let i = 1; i <= count; i++) {
    cards.push({ id: uid(), index: i, text: '' });
  }
  return cards;
}

function defaultEmojiPuzzles() {
  return [
    { id: uid(), emoji: '🦁👑🌍', solution: 'Der König der Löwen' },
    { id: uid(), emoji: '🕷️👨', solution: 'Spider-Man' },
    { id: uid(), emoji: '🧊👸❄️', solution: 'Die Eiskönigin' }
  ];
}

function defaultState() {
  return {
    meta: { name: 'Neue Show', updatedAt: Date.now() },
    settings: {
      primaryColor: '#0b1f6b',
      secondaryColor: '#f5c518',
      boardTextColor: '#ffffff',
      backgroundImage: '',
      logoText: 'BEAT THE M',
      logoImage: '',            // dataURL eines hochgeladenen PNG-Logos (ersetzt den Text, falls gesetzt)
      showFacecams: true,
      showModeratorCam: true,   // Facecam-Fenster oben links für den Moderator
      glowEnabled: true,
      glowColor: '#f5c518',
      glowBlur: 18,
      glowIntensity: 70
    },
    activePlayerId: null, // welcher Spieler gerade "dran" ist (Glow-Highlight)
    activeGame: 'jeopardy',
    games: {
      jeopardy: {
        round: 1,
        round1: defaultJeopardyCategories([100, 200, 300, 400, 500]),
        round2: defaultJeopardyCategories([200, 400, 600, 800, 1000]),
        activeQuestion: null, // { round, catId, qId }
        showAnswer: false
      },
      emoji: {
        puzzles: defaultEmojiPuzzles(),
        activeId: null,
        revealed: false
      },
      beichten: {
        cards: defaultBeichtenCards(50), // { id, index, text }
        activeIndex: 0,   // 0-basiert: welche Beichte gerade im Viewer offen ist
        revealed: false   // ob der Text der aktuellen Beichte aufgedeckt ist
      }
    },
    players: [
      { id: uid(), name: 'Spieler 1', score: 0, color: '#e74c3c', side: 'left', avatar: '' },
      { id: uid(), name: 'Spieler 2', score: 0, color: '#3498db', side: 'right', avatar: '' },
      { id: uid(), name: 'Spieler 3', score: 0, color: '#2ecc71', side: 'left', avatar: '' }
    ],
    soundboard: { sounds: [] }, // { id, name, dataUrl }
    soundTrigger: null // { id, ts } — transientes Signal ans Overlay: "spiel diesen Sound ab"
  };
}

// ---- Migration von altem, nicht-modularem State-Format ----
function migrateOldState(parsed) {
  if (!parsed) return null;
  if (parsed.games) return parsed; // schon neues Format
  if (!parsed.round1) return parsed; // unbekanntes Format, unverändert lassen (wird später gemerged)

  console.log('ℹ️  Migriere altes State-Format auf das neue modulare Format …');
  return {
    meta: { name: 'Show (migriert)', updatedAt: Date.now() },
    settings: parsed.settings || {},
    activeGame: 'jeopardy',
    games: {
      jeopardy: {
        round: parsed.round || 1,
        round1: parsed.round1,
        round2: parsed.round2,
        activeQuestion: parsed.activeQuestion || null,
        showAnswer: !!parsed.showAnswer
      },
      emoji: { puzzles: defaultEmojiPuzzles(), activeId: null, revealed: false }
    },
    players: parsed.players || [],
    soundboard: { sounds: [] },
    soundTrigger: null
  };
}

function deepMergeDefaults(loaded) {
  const def = defaultState();
  const merged = {
    ...def,
    ...loaded,
    meta: { ...def.meta, ...(loaded.meta || {}) },
    settings: { ...def.settings, ...(loaded.settings || {}) },
    games: {
      jeopardy: { ...def.games.jeopardy, ...((loaded.games || {}).jeopardy || {}) },
      emoji: { ...def.games.emoji, ...((loaded.games || {}).emoji || {}) },
      beichten: { ...def.games.beichten, ...((loaded.games || {}).beichten || {}) }
    },
    soundboard: { ...def.soundboard, ...(loaded.soundboard || {}) }
  };
  // Beichten-Karten absichern: muss ein Array mit fortlaufendem index sein
  if (!Array.isArray(merged.games.beichten.cards) || merged.games.beichten.cards.length === 0) {
    merged.games.beichten.cards = defaultBeichtenCards(50);
  } else {
    merged.games.beichten.cards.forEach((c, i) => {
      if (c.index === undefined) c.index = i + 1;
      if (c.text === undefined) c.text = '';
      if (!c.id) c.id = uid();
    });
  }
  if (typeof merged.games.beichten.activeIndex !== 'number') merged.games.beichten.activeIndex = 0;
  merged.games.beichten.activeIndex = Math.max(0, Math.min(merged.games.beichten.activeIndex, merged.games.beichten.cards.length - 1));
  // fehlende Medienfelder an alten Fragen ergänzen
  ['round1', 'round2'].forEach(key => {
    (merged.games.jeopardy[key] || []).forEach(cat => {
      (cat.questions || []).forEach(q => {
        if (q.mediaType === undefined) q.mediaType = 'none';
        if (q.mediaData === undefined) q.mediaData = '';
      });
    });
  });
  return merged;
}

let state = loadState();

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    let parsed = JSON.parse(raw);
    parsed = migrateOldState(parsed);
    return deepMergeDefaults(parsed);
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  state.meta.updatedAt = Date.now();
  fs.writeFile(STATE_FILE, JSON.stringify(state), () => {});
}

function slugify(name) {
  return (name || 'show')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'show';
}

// ============================================================
// Reducer
// ============================================================

function jp() { return state.games.jeopardy; }
function em() { return state.games.emoji; }
function bt() { return state.games.beichten; }

function getBoard(round) {
  return round === 2 ? jp().round2 : jp().round1;
}

function findQuestion(round, catId, qId) {
  const board = getBoard(round);
  const cat = board.find(c => c.id === catId);
  if (!cat) return null;
  const q = cat.questions.find(q => q.id === qId);
  if (!q) return null;
  return { cat, q };
}

function applyAction(action) {
  const { type, payload } = action;
  switch (type) {

    // ---------- Global ----------
    case 'SET_SETTINGS':
      state.settings = { ...state.settings, ...payload };
      break;

    case 'SET_ACTIVE_GAME':
      state.activeGame = payload.game;
      break;

    case 'SET_SHOW_NAME':
      state.meta.name = payload.name;
      break;

    // ---------- Spieler ----------
    case 'ADD_PLAYER':
      state.players.push({
        id: uid(),
        name: payload.name || 'Neuer Spieler',
        score: 0,
        color: payload.color || '#95a5a6',
        side: payload.side || (state.players.length % 2 === 0 ? 'left' : 'right'),
        avatar: payload.avatar || '' // PNG als dataURL oder URL
      });
      break;

    case 'REMOVE_PLAYER':
      state.players = state.players.filter(p => p.id !== payload.id);
      if (state.activePlayerId === payload.id) state.activePlayerId = null;
      break;

    case 'SET_ACTIVE_PLAYER': // { id } — { id: null } = niemand dran
      state.activePlayerId = (payload && payload.id && state.players.some(p => p.id === payload.id)) ? payload.id : null;
      break;

    case 'UPDATE_PLAYER': {
      const p = state.players.find(p => p.id === payload.id);
      if (p) {
        if (payload.name !== undefined) p.name = payload.name;
        if (payload.color !== undefined) p.color = payload.color;
        if (payload.side !== undefined) p.side = payload.side;
        if (payload.avatar !== undefined) p.avatar = payload.avatar;
      }
      break;
    }

    case 'ADJUST_SCORE': {
      const p = state.players.find(p => p.id === payload.id);
      if (p) p.score += payload.delta;
      break;
    }

    case 'SET_SCORE': {
      const p = state.players.find(p => p.id === payload.id);
      if (p) p.score = payload.value;
      break;
    }

    case 'RESET_SCORES':
      state.players.forEach(p => (p.score = 0));
      break;

    // ---------- Jeopardy ----------
    case 'SET_ROUND':
      jp().round = payload.round;
      jp().activeQuestion = null;
      jp().showAnswer = false;
      break;

    case 'EDIT_CATEGORY_NAME': {
      const board = getBoard(payload.round);
      const cat = board.find(c => c.id === payload.catId);
      if (cat) cat.name = payload.name;
      break;
    }

    case 'EDIT_QUESTION': {
      const found = findQuestion(payload.round, payload.catId, payload.qId);
      if (found) {
        if (payload.question !== undefined) found.q.question = payload.question;
        if (payload.answer !== undefined) found.q.answer = payload.answer;
      }
      break;
    }

    case 'EDIT_QUESTION_MEDIA': {
      const found = findQuestion(payload.round, payload.catId, payload.qId);
      if (found) {
        found.q.mediaType = payload.mediaType || 'none';
        found.q.mediaData = payload.mediaData || '';
      }
      break;
    }

    case 'OPEN_QUESTION':
      jp().activeQuestion = { round: payload.round, catId: payload.catId, qId: payload.qId };
      jp().showAnswer = false;
      break;

    case 'CLOSE_QUESTION':
      jp().activeQuestion = null;
      jp().showAnswer = false;
      break;

    case 'TOGGLE_ANSWER':
      jp().showAnswer = !jp().showAnswer;
      break;

    case 'MARK_ANSWERED': {
      const found = findQuestion(payload.round, payload.catId, payload.qId);
      if (found) found.q.answered = payload.answered;
      break;
    }

    case 'RESET_BOARD':
      [...jp().round1, ...jp().round2].forEach(cat =>
        cat.questions.forEach(q => (q.answered = false))
      );
      jp().activeQuestion = null;
      jp().showAnswer = false;
      break;

    // ---------- Emoji-Rätsel ----------
    case 'ADD_PUZZLE':
      em().puzzles.push({ id: uid(), emoji: payload.emoji || '❓', solution: payload.solution || '' });
      break;

    case 'EDIT_PUZZLE': {
      const p = em().puzzles.find(p => p.id === payload.id);
      if (p) {
        if (payload.emoji !== undefined) p.emoji = payload.emoji;
        if (payload.solution !== undefined) p.solution = payload.solution;
      }
      break;
    }

    case 'DELETE_PUZZLE':
      em().puzzles = em().puzzles.filter(p => p.id !== payload.id);
      if (em().activeId === payload.id) { em().activeId = null; em().revealed = false; }
      break;

    case 'OPEN_PUZZLE':
      em().activeId = payload.id;
      em().revealed = false;
      break;

    case 'CLOSE_PUZZLE':
      em().activeId = null;
      em().revealed = false;
      break;

    case 'REVEAL_PUZZLE':
      em().revealed = !em().revealed;
      break;

    // ---------- Beichten ----------
    case 'SET_BEICHTE_TEXT': {
      const card = bt().cards.find(c => c.index === payload.index);
      if (card) card.text = payload.text || '';
      break;
    }

    case 'BEICHTE_SET_INDEX': {
      const zeroBased = Math.max(0, Math.min(payload.index - 1, bt().cards.length - 1));
      bt().activeIndex = zeroBased;
      bt().revealed = false;
      break;
    }

    case 'BEICHTE_NEXT':
      bt().activeIndex = Math.min(bt().activeIndex + 1, bt().cards.length - 1);
      bt().revealed = false;
      break;

    case 'BEICHTE_PREV':
      bt().activeIndex = Math.max(bt().activeIndex - 1, 0);
      bt().revealed = false;
      break;

    case 'BEICHTE_REVEAL':
      bt().revealed = !bt().revealed;
      break;

    case 'BEICHTE_RESET':
      bt().activeIndex = 0;
      bt().revealed = false;
      break;

    // ---------- Soundboard ----------
    case 'ADD_SOUND':
      state.soundboard.sounds.push({ id: uid(), name: payload.name || 'Sound', dataUrl: payload.dataUrl });
      break;

    case 'RENAME_SOUND': {
      const s = state.soundboard.sounds.find(s => s.id === payload.id);
      if (s) s.name = payload.name;
      break;
    }

    case 'DELETE_SOUND':
      state.soundboard.sounds = state.soundboard.sounds.filter(s => s.id !== payload.id);
      break;

    case 'PLAY_SOUND':
      state.soundTrigger = { id: payload.id, ts: Date.now() };
      break;

    // ---------- Reset ----------
    case 'FULL_RESET':
      state = defaultState();
      break;

    case 'IMPORT_STATE':
      if (payload && payload.games && payload.players && payload.settings) {
        state = deepMergeDefaults(payload);
      }
      break;

    default:
      console.warn('Unbekannte Aktion:', type);
  }
}

// ============================================================
// SSE
// ============================================================

let sseClients = [];
function broadcastState() {
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  sseClients.forEach(res => res.write(payload));
}

// ============================================================
// HTTP-Server
// ============================================================

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res) {
  let filePath = req.url.split('?')[0];
  if (filePath === '/') filePath = '/moderator.html';
  const fullPath = path.join(PUBLIC_DIR, filePath);
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nicht gefunden: ' + filePath);
      return;
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); }
    });
  });
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  // ---- öffentlich (Overlay braucht keinen Login) ----
  if (req.url === '/api/state' && req.method === 'GET') {
    return sendJson(res, 200, state);
  }

  if (req.url === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`data: ${JSON.stringify(state)}\n\n`);
    sseClients.push(res);
    req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
    return;
  }

  // ---- Login ----
  if (req.url === '/api/login' && req.method === 'POST') {
    try {
      const { password } = await readBody(req);
      if (password === MOD_PASSWORD) {
        const token = uid();
        validTokens.add(token);
        return sendJson(res, 200, { ok: true, token });
      }
      return sendJson(res, 401, { ok: false, error: 'Falsches Passwort' });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: String(e) });
    }
  }

  if (req.url === '/api/validate' && req.method === 'GET') {
    return sendJson(res, 200, { ok: isAuthed(req) });
  }

  // ---- Ab hier: Login erforderlich ----
  const needsAuth = req.url === '/api/action'
    || req.url === '/api/shows' && req.method !== 'GET'
    || req.url.startsWith('/api/shows/');

  if (needsAuth && !isAuthed(req)) {
    return sendJson(res, 401, { ok: false, error: 'Nicht angemeldet' });
  }

  if (req.url === '/api/action' && req.method === 'POST') {
    try {
      const action = await readBody(req);
      applyAction(action);
      saveState();
      broadcastState();
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: String(e) });
    }
  }

  // ---- Shows verwalten (mehrere Shows speichern/laden) ----
  if (req.url === '/api/shows' && req.method === 'GET') {
    if (!isAuthed(req)) return sendJson(res, 401, { ok: false, error: 'Nicht angemeldet' });
    try {
      const files = fs.readdirSync(SHOWS_DIR).filter(f => f.endsWith('.json'));
      const list = files.map(f => {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(SHOWS_DIR, f), 'utf8'));
          return { id: f.replace(/\.json$/, ''), name: (raw.meta && raw.meta.name) || f, updatedAt: (raw.meta && raw.meta.updatedAt) || 0 };
        } catch (e) { return null; }
      }).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
      return sendJson(res, 200, { ok: true, shows: list });
    } catch (e) {
      return sendJson(res, 200, { ok: true, shows: [] });
    }
  }

  if (req.url === '/api/shows/save' && req.method === 'POST') {
    try {
      const { name } = await readBody(req);
      if (name) state.meta.name = name;
      state.meta.updatedAt = Date.now();
      const id = slugify(state.meta.name) + '-' + Date.now().toString(36);
      fs.writeFileSync(path.join(SHOWS_DIR, id + '.json'), JSON.stringify(state));
      return sendJson(res, 200, { ok: true, id });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: String(e) });
    }
  }

  if (req.url === '/api/shows/load' && req.method === 'POST') {
    try {
      const { id } = await readBody(req);
      const file = path.join(SHOWS_DIR, id + '.json');
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      state = deepMergeDefaults(migrateOldState(raw));
      saveState();
      broadcastState();
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: String(e) });
    }
  }

  if (req.url === '/api/shows/delete' && req.method === 'POST') {
    try {
      const { id } = await readBody(req);
      const file = path.join(SHOWS_DIR, id + '.json');
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: String(e) });
    }
  }

  if (req.url === '/api/shows/new' && req.method === 'POST') {
    try {
      const { name } = await readBody(req);
      state = defaultState();
      if (name) state.meta.name = name;
      saveState();
      broadcastState();
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: String(e) });
    }
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log('==========================================');
  console.log(' Beat the M — Gameshow-Plattform läuft!');
  console.log(` Moderator:  http://localhost:${PORT}/moderator.html`);
  console.log(` Overlay:    http://localhost:${PORT}/overlay.html`);
  console.log(` Moderator-Passwort: ${MOD_PASSWORD}`);
  console.log('==========================================');
});
