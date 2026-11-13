// Gemeinsamer Client-Code für Moderator- und Overlay-Ansicht

async function sendAction(type, payload = {}) {
  const token = localStorage.getItem('modToken') || '';
  const res = await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
    body: JSON.stringify({ type, payload })
  });
  if (res.status === 401) {
    localStorage.removeItem('modToken');
    if (typeof window.onAuthLost === 'function') window.onAuthLost();
  }
  return res;
}

function applyThemeColors(settings) {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', settings.primaryColor);
  root.style.setProperty('--color-secondary', settings.secondaryColor);
  root.style.setProperty('--color-text', settings.boardTextColor);
}

function applyGlowSettings(settings) {
  const root = document.documentElement;
  root.style.setProperty('--glow-color', hexToRgbTriplet(settings.glowColor || '#f5c518'));
  root.style.setProperty('--glow-blur', (settings.glowBlur ?? 18) + 'px');
  root.style.setProperty('--glow-alpha', (settings.glowIntensity ?? 70) / 100);
  document.body.classList.toggle('no-glow', settings.glowEnabled === false);
}

function hexToRgbTriplet(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return '245,197,24';
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)].join(',');
}

function connectLiveState(onState) {
  // initial fetch, dann SSE-Stream für Live-Updates
  fetch('/api/state').then(r => r.json()).then(onState);

  const es = new EventSource('/api/events');
  es.onmessage = (e) => {
    try {
      const state = JSON.parse(e.data);
      onState(state);
    } catch (err) {
      console.error('State-Parse-Fehler', err);
    }
  };
  es.onerror = () => {
    // EventSource versucht automatisch neu zu verbinden
  };
  return es;
}

function currentBoard(state) {
  const jeopardy = state.games.jeopardy;
  return jeopardy.round === 2 ? jeopardy.round2 : jeopardy.round1;
}
