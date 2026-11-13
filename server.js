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

function makeQuestion(value) {
  return {
    id: uid(),
    value,
    question: '',
    answer: '',
    answered: false,
    mediaType: 'none', // 'none' | 'image' | 'audio'
    mediaData: '',     // dataURL (wird NICHT über SSE/state verschickt, sondern über /media/q/<id>)
    mediaName: '',     // Dateiname des Bildes (für Text-Export/Import)
    mediaVer: 0        // Zeitstempel der letzten Bildänderung (Cache-Busting)
  };
}

function makeCategory(name, values) {
  return { id: uid(), name, questions: values.map(v => makeQuestion(v)) };
}

function makeBoard(name, values, categoryCount) {
  const cats = [];
  for (let i = 1; i <= categoryCount; i++) cats.push(makeCategory('Kategorie ' + i, values));
  return { id: uid(), name, values: values.slice(), categories: cats };
}

function defaultJeopardy() {
  const boards = [
    makeBoard('Runde 1', [100, 200, 300, 400, 500], 6),
    makeBoard('Runde 2', [200, 400, 600, 800, 1000], 6)
  ];
  return {
    boards,                       // beliebig viele Bretter
    activeBoardId: boards[0].id,  // welches Brett gerade im Overlay live ist
    activeQuestion: null,         // { boardId, catId, qId }
    showAnswer: false,
    winnerShown: false,           // Gewinner-Animation im Overlay aktiv?
    winnerTs: 0                   // Zeitstempel, damit die Animation bei erneutem Start neu läuft
  };
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
      glowIntensity: 70,
      autoWinner: true          // Gewinner-Animation automatisch nach der letzten Frage
    },
    activePlayerId: null, // welcher Spieler gerade "dran" ist (Glow-Highlight)
    activeGame: 'jeopardy',
    games: {
      jeopardy: defaultJeopardy(),
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

// Altes Format (round1/round2) -> neues Format (boards[]). Bestehende Fragen bleiben erhalten.
function migrateJeopardy(old) {
  if (!old || Array.isArray(old.boards)) return old;
  if (!old.round1 && !old.round2) return old; // nichts zu migrieren -> Defaults greifen
  console.log('ℹ️  Migriere Jeopardy-Runden auf das Mehrfach-Brett-Format …');
  const toBoard = (cats, name, fallbackValues) => {
    cats = Array.isArray(cats) ? cats : [];
    const values = (cats[0] && cats[0].questions && cats[0].questions.map(q => q.value)) || fallbackValues;
    if (!cats.length) cats = [makeCategory('Kategorie 1', values)];
    return { id: uid(), name, values, categories: cats };
  };
  const b1 = toBoard(old.round1, 'Runde 1', [100, 200, 300, 400, 500]);
  const b2 = toBoard(old.round2, 'Runde 2', [200, 400, 600, 800, 1000]);
  let aq = null;
  if (old.activeQuestion) {
    const bd = old.activeQuestion.round === 2 ? b2 : b1;
    aq = { boardId: bd.id, catId: old.activeQuestion.catId, qId: old.activeQuestion.qId };
  }
  return {
    boards: [b1, b2],
    activeBoardId: (old.round === 2 ? b2 : b1).id,
    activeQuestion: aq,
    showAnswer: !!old.showAnswer,
    winnerShown: !!old.winnerShown,
    winnerTs: old.winnerTs || 0
  };
}

function deepMergeDefaults(loaded) {
  const def = defaultState();
  const loadedJeopardy = migrateJeopardy((loaded.games || {}).jeopardy);
  const merged = {
    ...def,
    ...loaded,
    meta: { ...def.meta, ...(loaded.meta || {}) },
    settings: { ...def.settings, ...(loaded.settings || {}) },
    games: {
      jeopardy: { ...def.games.jeopardy, ...(loadedJeopardy || {}) },
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
  // Jeopardy-Bretter absichern (fehlende Felder ergänzen, Altlasten entfernen)
  const J = merged.games.jeopardy;
  delete J.round; delete J.round1; delete J.round2;
  if (!Array.isArray(J.boards) || J.boards.length === 0) J.boards = defaultJeopardy().boards;
  J.boards.forEach((bd, i) => {
    if (!bd.id) bd.id = uid();
    if (!bd.name) bd.name = 'Brett ' + (i + 1);
    if (!Array.isArray(bd.categories) || bd.categories.length === 0) bd.categories = [makeCategory('Kategorie 1', bd.values || [100, 200, 300, 400, 500])];
    if (!Array.isArray(bd.values) || bd.values.length === 0) bd.values = bd.categories[0].questions.map(q => q.value);
    bd.categories.forEach(cat => {
      (cat.questions || []).forEach(q => {
        if (q.mediaType === undefined) q.mediaType = 'none';
        if (q.mediaData === undefined) q.mediaData = '';
        if (q.mediaName === undefined) q.mediaName = '';
        if (q.mediaVer === undefined) q.mediaVer = 0;
      });
    });
  });
  if (!J.boards.some(b => b.id === J.activeBoardId)) J.activeBoardId = J.boards[0].id;
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

const MAX_CATEGORIES = 8;
const MAX_ROWS = 8;

function boardById(id) { return jp().boards.find(b => b.id === id) || null; }
function activeBoard() { return boardById(jp().activeBoardId) || jp().boards[0]; }

function sanitizeValues(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(Number).filter(n => Number.isFinite(n) && n >= 0).map(Math.round).slice(0, MAX_ROWS);
}

function findQuestion(boardId, catId, qId) {
  const board = boardById(boardId);
  if (!board) return null;
  const cat = board.categories.find(c => c.id === catId);
  if (!cat) return null;
  const q = cat.questions.find(q => q.id === qId);
  if (!q) return null;
  return { board, cat, q };
}

function findQuestionById(qId) {
  for (const board of jp().boards)
    for (const cat of board.categories)
      for (const q of cat.questions) if (q.id === qId) return q;
  return null;
}

// schließt die offene Frage, falls es sie (z. B. nach dem Löschen) nicht mehr gibt
function closeActiveIfMissing() {
  const aq = jp().activeQuestion;
  if (aq && !findQuestion(aq.boardId, aq.catId, aq.qId)) {
    jp().activeQuestion = null;
    jp().showAnswer = false;
  }
}

function resetQuestion(q) {
  q.question = ''; q.answer = ''; q.answered = false;
  q.mediaType = 'none'; q.mediaData = ''; q.mediaName = ''; q.mediaVer = 0;
}

// true, wenn jede BEFÜLLTE Frage (Text oder Bild) auf ALLEN Brettern abgehakt ist.
// Leere Fragen/Bretter zählen nicht mit -> Reserve-Bretter blockieren das Spielende nicht.
function allQuestionsAnswered() {
  let relevant = 0;
  for (const board of jp().boards) {
    for (const cat of board.categories) {
      for (const q of cat.questions) {
        const filled = !!(q.question && q.question.trim()) || q.mediaType === 'image';
        if (!filled) continue;
        relevant++;
        if (!q.answered) return false;
      }
    }
  }
  return relevant > 0;
}

// Startet automatisch die Gewinner-Animation, sobald die letzte Frage abgeschlossen ist
function maybeAutoWinner() {
  if (state.settings.autoWinner === false) return;
  if (jp().activeQuestion || jp().winnerShown) return;
  if (state.players.length > 0 && allQuestionsAnswered()) {
    jp().winnerShown = true;
    jp().winnerTs = Date.now();
  }
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

    // ---------- Jeopardy (mehrere Bretter) ----------
    case 'SET_ACTIVE_BOARD': // { boardId } — welches Brett ist live im Overlay
      if (boardById(payload.boardId)) {
        jp().activeBoardId = payload.boardId;
        jp().activeQuestion = null;
        jp().showAnswer = false;
        jp().winnerShown = false;
      }
      break;

    case 'ADD_BOARD': { // { id?, name?, values? } — neues Brett (wird NICHT automatisch live geschaltet)
      const cur = activeBoard();
      const wanted = sanitizeValues(payload.values);
      const values = wanted.length ? wanted : cur.values.slice();
      const board = makeBoard(String(payload.name || ('Brett ' + (jp().boards.length + 1))).slice(0, 60), values, 6);
      if (typeof payload.id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(payload.id) && !boardById(payload.id)) board.id = payload.id;
      jp().boards.push(board);
      break;
    }

    case 'DELETE_BOARD': { // { boardId } — mindestens ein Brett bleibt
      if (jp().boards.length <= 1) break;
      const idx = jp().boards.findIndex(b => b.id === payload.boardId);
      if (idx === -1) break;
      const [removed] = jp().boards.splice(idx, 1);
      if (jp().activeBoardId === removed.id) {
        jp().activeBoardId = jp().boards[Math.min(idx, jp().boards.length - 1)].id;
        jp().winnerShown = false;
      }
      closeActiveIfMissing();
      break;
    }

    case 'RENAME_BOARD': { // { boardId, name }
      const board = boardById(payload.boardId);
      const name = String(payload.name || '').trim().slice(0, 60);
      if (board && name) board.name = name;
      break;
    }

    case 'SET_BOARD_VALUES': { // { boardId, values:[100,200,...] } — Punktwerte = Zeilen (1–8)
      const board = boardById(payload.boardId);
      const values = sanitizeValues(payload.values);
      if (!board || !values.length) break;
      board.values = values;
      board.categories.forEach(cat => {
        while (cat.questions.length > values.length) cat.questions.pop();
        while (cat.questions.length < values.length) cat.questions.push(makeQuestion(values[cat.questions.length]));
        cat.questions.forEach((q, i) => { q.value = values[i]; });
      });
      closeActiveIfMissing();
      break;
    }

    case 'ADD_CATEGORY': { // { boardId }
      const board = boardById(payload.boardId);
      if (!board || board.categories.length >= MAX_CATEGORIES) break;
      board.categories.push(makeCategory('Kategorie ' + (board.categories.length + 1), board.values));
      break;
    }

    case 'REMOVE_CATEGORY': { // { boardId, catId }
      const board = boardById(payload.boardId);
      if (!board || board.categories.length <= 1) break;
      const idx = board.categories.findIndex(c => c.id === payload.catId);
      if (idx === -1) break;
      board.categories.splice(idx, 1);
      closeActiveIfMissing();
      break;
    }

    case 'SHOW_WINNER':
      jp().winnerShown = true;
      jp().winnerTs = Date.now();
      break;

    case 'HIDE_WINNER':
      jp().winnerShown = false;
      break;

    case 'EDIT_CATEGORY_NAME': {
      const board = boardById(payload.boardId);
      const cat = board && board.categories.find(c => c.id === payload.catId);
      if (cat) cat.name = payload.name;
      break;
    }

    case 'EDIT_QUESTION': {
      const found = findQuestion(payload.boardId, payload.catId, payload.qId);
      if (found) {
        if (payload.question !== undefined) found.q.question = payload.question;
        if (payload.answer !== undefined) found.q.answer = payload.answer;
      }
      break;
    }

    case 'EDIT_QUESTION_MEDIA': { // { boardId, catId, qId, mediaType, mediaData, mediaName }
      const found = findQuestion(payload.boardId, payload.catId, payload.qId);
      if (found) {
        found.q.mediaType = payload.mediaData ? (payload.mediaType || 'image') : 'none';
        found.q.mediaData = payload.mediaData || '';
        found.q.mediaName = payload.mediaData ? String(payload.mediaName || '').slice(0, 120) : '';
        found.q.mediaVer = Date.now();
      }
      break;
    }

    // Text-Import: { boardId, replace, boardName?, categories:{ "1":"Name" }, questions:[{ k, f, question?, answer?, media?:{ name, dataUrl } }] }
    case 'IMPORT_BOARD': {
      const board = boardById(payload.boardId);
      if (!board) break;
      const cats = (payload.categories && typeof payload.categories === 'object') ? payload.categories : {};
      const qs = Array.isArray(payload.questions) ? payload.questions : [];
      const ks = [...Object.keys(cats).map(Number), ...qs.map(x => Number(x.k))].filter(n => Number.isInteger(n) && n > 0);
      const maxK = Math.min(MAX_CATEGORIES, Math.max(1, ...ks));

      // Ein noch leeres Brett (keine Fragen, Standardnamen) wird automatisch auf die genutzten Kategorien zugeschnitten
      const untouched = board.categories.every(c =>
        /^Kategorie \d+$/.test(c.name) && c.questions.every(q => !q.question && !q.answer && q.mediaType !== 'image'));

      if (payload.replace) {
        board.categories.forEach((cat, i) => {
          cat.name = 'Kategorie ' + (i + 1);
          cat.questions.forEach(resetQuestion);
        });
        jp().activeQuestion = null;
        jp().showAnswer = false;
      }
      if (payload.replace || untouched) {
        while (board.categories.length > maxK) board.categories.pop();
      }
      while (board.categories.length < maxK) {
        board.categories.push(makeCategory('Kategorie ' + (board.categories.length + 1), board.values));
      }
      if (payload.boardName) board.name = String(payload.boardName).trim().slice(0, 60) || board.name;

      Object.keys(cats).forEach(k => {
        const cat = board.categories[Number(k) - 1];
        if (cat) cat.name = String(cats[k]).slice(0, 60);
      });
      qs.forEach(it => {
        const cat = board.categories[Number(it.k) - 1];
        const q = cat && cat.questions[Number(it.f) - 1];
        if (!q) return;
        if (typeof it.question === 'string') q.question = it.question;
        if (typeof it.answer === 'string') q.answer = it.answer;
        if (it.media && typeof it.media.dataUrl === 'string' && it.media.dataUrl.startsWith('data:')) {
          q.mediaType = 'image';
          q.mediaData = it.media.dataUrl;
          q.mediaName = String(it.media.name || '').slice(0, 120);
          q.mediaVer = Date.now();
        }
        q.answered = false;
      });
      closeActiveIfMissing();
      break;
    }

    case 'OPEN_QUESTION': // { boardId, catId, qId }
      if (findQuestion(payload.boardId, payload.catId, payload.qId)) {
        jp().activeQuestion = { boardId: payload.boardId, catId: payload.catId, qId: payload.qId };
        jp().showAnswer = false;
      }
      break;

    case 'CLOSE_QUESTION':
      jp().activeQuestion = null;
      jp().showAnswer = false;
      maybeAutoWinner();
      break;

    case 'TOGGLE_ANSWER':
      jp().showAnswer = !jp().showAnswer;
      break;

    case 'MARK_ANSWERED': {
      const found = findQuestion(payload.boardId, payload.catId, payload.qId);
      if (found) found.q.answered = payload.answered;
      if (payload.answered) maybeAutoWinner(); // greift nur, wenn gerade keine Frage offen ist
      break;
    }

    case 'RESET_BOARD': { // { boardId? } — ohne boardId werden ALLE Bretter zurückgesetzt
      const targets = payload && payload.boardId ? [boardById(payload.boardId)].filter(Boolean) : jp().boards;
      targets.forEach(board => board.categories.forEach(cat => cat.questions.forEach(q => (q.answered = false))));
      jp().activeQuestion = null;
      jp().showAnswer = false;
      jp().winnerShown = false;
      break;
    }

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
// Fragen-Bilder (mediaData) werden NICHT mitgeschickt — das Overlay lädt sie einzeln über
// /media/q/<id> (und der Browser cached sie). So bleibt jedes Live-Update klein.
const slimReplacer = (key, value) => (key === 'mediaData' ? '' : value);
const slimJson = () => JSON.stringify(state, slimReplacer);

function broadcastState() {
  const payload = `data: ${slimJson()}\n\n`;
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
  const [pathname, queryString = ''] = req.url.split('?');

  // ?full=1 liefert den kompletten State inkl. Bilder (wird für das Backup/den Export gebraucht)
  if (pathname === '/api/state' && req.method === 'GET') {
    const body = queryString.split('&').includes('full=1') ? JSON.stringify(state) : slimJson();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(body);
  }

  // Bild einer Frage (liegt als dataURL im State) als normale Bilddatei ausliefern
  const mediaMatch = pathname.match(/^\/media\/q\/([A-Za-z0-9-]+)$/);
  if (mediaMatch && req.method === 'GET') {
    const q = findQuestionById(mediaMatch[1]);
    const m = q && q.mediaData ? /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(q.mediaData) : null;
    if (!m) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Kein Bild'); }
    const buf = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
    res.writeHead(200, {
      'Content-Type': m[1],
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=31536000, immutable' // URL enthält ?v=<mediaVer>
    });
    return res.end(buf);
  }

  if (req.url === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`data: ${slimJson()}\n\n`);
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
