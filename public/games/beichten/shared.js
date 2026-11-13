// Beichten — gemeinsame Login-/Sync-Logik für moderator.html + overlay.html
// Bewusst eigenständig (kein Zugriff auf public/client.js nötig), damit diese
// Seiten unabhängig vom Rest funktionieren.

const BEICHTEN_TOKEN_KEY = 'beichten_auth_token';

function beichtenGetToken() {
  return localStorage.getItem(BEICHTEN_TOKEN_KEY) || '';
}

function beichtenSetToken(token) {
  localStorage.setItem(BEICHTEN_TOKEN_KEY, token);
}

function beichtenClearToken() {
  localStorage.removeItem(BEICHTEN_TOKEN_KEY);
}

async function beichtenLogin(password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const data = await res.json();
  if (data.ok) {
    beichtenSetToken(data.token);
    return true;
  }
  return false;
}

async function beichtenValidate() {
  const token = beichtenGetToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/validate', { headers: { 'x-auth-token': token } });
    const data = await res.json();
    return !!data.ok;
  } catch (e) {
    return false;
  }
}

// Sendet eine Action an den Server. Bei 401 wird der Token gelöscht und
// die übergebene onAuthLost-Funktion aufgerufen (z. B. zurück zum Login).
async function beichtenSendAction(type, payload, onAuthLost) {
  const res = await fetch('/api/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': beichtenGetToken()
    },
    body: JSON.stringify({ type, payload })
  });
  if (res.status === 401) {
    beichtenClearToken();
    if (onAuthLost) onAuthLost();
    return null;
  }
  return res.json();
}

// Lädt einmal den State und hält ihn danach per SSE aktuell.
function beichtenConnectLiveState(onState) {
  fetch('/api/state').then(r => r.json()).then(onState).catch(() => {});
  const es = new EventSource('/api/events');
  es.onmessage = (ev) => {
    try { onState(JSON.parse(ev.data)); } catch (e) { /* ignore */ }
  };
  return es;
}

// Baut den simplen Login-Screen in ein gegebenes Root-Element.
// onSuccess wird nach erfolgreichem Login (oder gültigem Token) aufgerufen.
function beichtenMountLogin(rootEl, onSuccess) {
  async function tryExisting() {
    if (await beichtenValidate()) {
      onSuccess();
      return true;
    }
    return false;
  }

  tryExisting().then(ok => {
    if (ok) return;
    rootEl.innerHTML = `
      <div class="beichten-login">
        <h2>🔒 Beichten — Login</h2>
        <p>Gleiches Passwort wie die Moderator-Ansicht.</p>
        <input type="password" id="beichtenPw" placeholder="Passwort" />
        <button class="btn-primary" id="beichtenLoginBtn">Anmelden</button>
        <div class="beichten-login-error" id="beichtenLoginErr"></div>
      </div>
    `;
    const pwInput = rootEl.querySelector('#beichtenPw');
    const btn = rootEl.querySelector('#beichtenLoginBtn');
    const err = rootEl.querySelector('#beichtenLoginErr');

    async function submit() {
      err.textContent = '';
      const ok = await beichtenLogin(pwInput.value);
      if (ok) {
        onSuccess();
      } else {
        err.textContent = 'Falsches Passwort.';
      }
    }

    btn.addEventListener('click', submit);
    pwInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    pwInput.focus();
  });
}
