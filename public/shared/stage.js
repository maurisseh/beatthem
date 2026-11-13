// Beat the M — globales Stage-Layout (1920×1080-Canvas)
//
//  ┌──────────────────────────────────────────────┐
//  │                 [ LOGO (PNG) ]               │  oben Mitte
//  │                                              │
//  │        SAFE_CONTENT_AREA (Spielinhalt)       │  hier rendert das jeweilige Spiel
//  │                                              │
//  │  [Av1] [Av2]   ┌ Host-Facecam ┐   [Av3] [Av4]│  unten: Avatare + deine Facecam
//  └────────────────└──────────────┘──────────────┘  Facecam sitzt ganz am unteren Rand
//
// Nutzung:
//   const stage = Stage.init(document.getElementById('stage'));
//   stage.content   → Element für den Spielinhalt (liegt exakt in SAFE_CONTENT_AREA)
//   Stage.update(state)  bei jedem neuen State aufrufen
//   Stage.fit(canvasEl)  skaliert den 1920×1080-Canvas in sein Eltern-Element
//
// Spieler-Avatare: players[i].avatar = PNG als dataURL oder URL (max. 4 Spieler sichtbar).
// Wer gerade dran ist: state.activePlayerId → Avatar blinkt in der Spielerfarbe.

const Stage = (() => {
  const W = 1920;
  const H = 1080;

  const LOGO_AREA = { x: 560, y: 14, w: 800, h: 160 };
  const SAFE_CONTENT_AREA = { x: 60, y: 190, w: 1800, h: 590 };

  // Deine Facecam: 16:9, bündig am unteren Rand, mittig
  const HOST_CAM = { x: 720, y: 810, w: 480, h: 270 };

  // Avatar-Slots (Avatar quadratisch + Namensschild darunter)
  const SLOT_W = 220;
  const SLOT_H = 264;
  const SLOT_Y = 806;
  const SLOT_X = {
    L1: 190,   // außen links
    L2: 450,   // innen links
    R1: 1250,  // innen rechts
    R2: 1510   // außen rechts
  };
  // Welche Slots bei wie vielen Spielern belegt werden (Reihenfolge = Spielerreihenfolge)
  const LAYOUTS = {
    1: ['L2'],
    2: ['L2', 'R1'],
    3: ['L1', 'L2', 'R1'],
    4: ['L1', 'L2', 'R1', 'R2']
  };
  const MAX_PLAYERS = 4;

  let els = null;

  function px(el, r) {
    el.style.left = r.x + 'px';
    el.style.top = r.y + 'px';
    el.style.width = r.w + 'px';
    el.style.height = r.h + 'px';
  }

  function init(root) {
    root.classList.add('stage-root');
    root.innerHTML = '';

    // Hintergrund-Ebene (mit "Loch" für die Host-Facecam, damit OBS durchscheint)
    const bg = document.createElement('div');
    bg.className = 'stage-bg';
    root.appendChild(bg);

    // Spielinhalt
    const content = document.createElement('div');
    content.className = 'stage-content';
    px(content, SAFE_CONTENT_AREA);
    root.appendChild(content);

    // Logo
    const logo = document.createElement('img');
    logo.className = 'stage-logo';
    logo.alt = '';
    px(logo, LOGO_AREA);
    root.appendChild(logo);

    // Host-Facecam-Rahmen (transparent)
    const hostcam = document.createElement('div');
    hostcam.className = 'stage-hostcam facecam-frame';
    px(hostcam, HOST_CAM);
    root.appendChild(hostcam);

    // Avatar-Slots (max. 4)
    const slots = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const slot = document.createElement('div');
      slot.className = 'stage-slot hidden';
      slot.style.width = SLOT_W + 'px';
      slot.style.height = SLOT_H + 'px';
      slot.style.top = SLOT_Y + 'px';

      const avatar = document.createElement('div');
      avatar.className = 'stage-avatar';
      const img = document.createElement('img');
      img.alt = '';
      img.className = 'hidden';
      const ph = document.createElement('span');
      ph.className = 'stage-avatar-ph';
      ph.textContent = '?';
      avatar.appendChild(img);
      avatar.appendChild(ph);

      const plate = document.createElement('div');
      plate.className = 'stage-plate';
      const name = document.createElement('span');
      name.className = 'stage-plate-name';
      const score = document.createElement('span');
      score.className = 'stage-plate-score';
      plate.appendChild(name);
      plate.appendChild(score);

      slot.appendChild(avatar);
      slot.appendChild(plate);
      root.appendChild(slot);
      slots.push({ slot, img, ph, name, score });
    }

    els = { root, bg, content, logo, hostcam, slots };
    return { content };
  }

  function holePolygon() {
    const { x, y, w, h } = HOST_CAM;
    const x2 = x + w, y2 = y + h;
    return `polygon(evenodd, 0px 0px, ${W}px 0px, ${W}px ${H}px, 0px ${H}px, 0px 0px, ` +
           `${x}px ${y}px, ${x}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${y}px, ${x}px ${y}px)`;
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

  function update(state) {
    if (!els) return;
    const s = state.settings || {};

    // Hintergrundbild (mit transparentem Loch an der Host-Facecam)
    if (s.backgroundImage) {
      els.bg.style.backgroundImage = `url("${s.backgroundImage}")`;
      els.bg.style.clipPath = s.showModeratorCam === false ? 'none' : holePolygon();
      els.bg.classList.remove('hidden');
    } else {
      els.bg.style.backgroundImage = '';
      els.bg.classList.add('hidden');
    }

    // Logo: nur PNG (kein Text mehr)
    setImg(els.logo, s.logoImage || '');

    // Deine Facecam-Umrandung
    els.hostcam.classList.toggle('hidden', s.showModeratorCam === false);

    // Spieler-Avatare
    const players = (state.players || []).slice(0, MAX_PLAYERS);
    const layout = LAYOUTS[players.length] || [];
    const activeId = state.activePlayerId || null;
    const someoneActive = !!activeId && players.some(p => p.id === activeId);

    els.slots.forEach((sl, i) => {
      const p = players[i];
      if (!p) { sl.slot.classList.add('hidden'); return; }
      sl.slot.classList.remove('hidden');
      sl.slot.style.left = SLOT_X[layout[i]] + 'px';
      sl.slot.style.setProperty('--player-color', p.color || '#f5c518');
      sl.slot.classList.toggle('is-active', p.id === activeId);
      sl.slot.classList.toggle('is-dimmed', someoneActive && p.id !== activeId);

      setImg(sl.img, p.avatar || '');
      sl.ph.classList.toggle('hidden', !!p.avatar);
      sl.name.textContent = p.name || '';
      sl.score.textContent = p.score;
    });
  }

  // Skaliert den 1920×1080-Canvas so, dass er in sein Eltern-Element passt.
  function fit(canvasEl) {
    const parent = canvasEl.parentElement;
    const scale = Math.min(parent.clientWidth / W, parent.clientHeight / H || Infinity);
    canvasEl.style.transformOrigin = 'top left';
    canvasEl.style.transform = `scale(${scale})`;
    return scale;
  }

  // Spielbrett o. Ä. weichzeichnen, solange eine Frage davor eingeblendet ist
  function setBlur(el, on) {
    el.classList.toggle('stage-blur', !!on);
  }

  return { W, H, LOGO_AREA, SAFE_CONTENT_AREA, HOST_CAM, init, update, fit, setBlur };
})();

if (typeof window !== 'undefined') window.Stage = Stage;
