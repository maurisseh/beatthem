// Beat the M — globales Stage-Layout (1920×1080-Canvas)
//
//  ┌──────────────────────────────────────────────┐
//  │                 [ LOGO (PNG) ]               │  oben Mitte
//  │                                              │
//  │        SAFE_CONTENT_AREA (Spielinhalt)       │  hier rendert das jeweilige Spiel
//  │                                              │
//  │  [Av1] [Av2]   ┌ Host-Facecam ┐   [Av3] [Av4]│  unten: Avatare + deine Facecam (Kamera: HOST_INNER)
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
  const SAFE_CONTENT_AREA = { x: 60, y: 190, w: 1800, h: 580 };

  // Deine Facecam: dicker Rahmen mit runden Ecken. Der runde Innenrand überdeckt
  // die Ecken deiner Kamera. Kamera-Bereich (16:9) = HOST_INNER, Rahmen liegt außen drumherum.
  const HOST_BORDER = 16;
  const HOST_RADIUS = 36; // Außenradius -> Innenradius = 36 - 16 = 20
  const HOST_INNER = { x: 720, y: 794, w: 480, h: 270 };       // hier die Webcam in OBS platzieren
  const HOST_CAM = {                                             // Rahmen außen (Rand unten bündig)
    x: HOST_INNER.x - HOST_BORDER, y: HOST_INNER.y - HOST_BORDER,
    w: HOST_INNER.w + 2 * HOST_BORDER, h: HOST_INNER.h + 2 * HOST_BORDER
  };

  // Avatar-Slots (Avatar quadratisch + Namensschild darunter)
  const SLOT_W = 200;
  const SLOT_H = 278;
  const SLOT_Y = 792;
  const SLOT_X = {
    L1: 210,   // außen links
    L2: 470,   // innen links
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

  function roundedRectPath(x, y, w, h, r) {
    return `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} ` +
           `A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} ` +
           `V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  }

  // Ausschnitt ("Loch") exakt im runden Innenrand der Facecam. 2px größer als der Innenrand,
  // damit er unter dem deckenden Rahmen verschwindet (keine Haarlinie an der Kante).
  function holeClip() {
    const g = 2;
    const r = HOST_RADIUS - HOST_BORDER + g;
    const hole = roundedRectPath(HOST_INNER.x - g, HOST_INNER.y - g, HOST_INNER.w + 2 * g, HOST_INNER.h + 2 * g, r);
    return `path(evenodd, "M0 0 H${W} V${H} H0 Z ${hole}")`;
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
      els.bg.style.clipPath = s.showModeratorCam === false ? 'none' : holeClip();
      els.bg.classList.remove('hidden');
    } else {
      els.bg.style.backgroundImage = '';
      els.bg.classList.add('hidden');
    }

    // Logo: nur PNG (kein Text mehr)
    setImg(els.logo, s.logoImage || '');

    // Deine Facecam-Umrandung: Farbe + Dicke einstellbar. Die Kamera-Innenfläche (HOST_INNER) bleibt
    // immer gleich, die Kontur wächst nach außen; der Innenradius bleibt 20 px (überdeckt die Kamera-Ecken).
    const fw = Math.max(2, Math.min(40, Number(s.camFrameWidth) || HOST_BORDER));
    const hc = els.hostcam.style;
    hc.left = (HOST_INNER.x - fw) + 'px';
    hc.top = (HOST_INNER.y - fw) + 'px';
    hc.width = (HOST_INNER.w + 2 * fw) + 'px';
    hc.height = (HOST_INNER.h + 2 * fw) + 'px';
    hc.borderWidth = fw + 'px';
    hc.borderRadius = (HOST_RADIUS - HOST_BORDER + fw) + 'px';
    hc.borderColor = s.camFrameColor || ''; // leer = Akzentfarbe
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

  return { W, H, LOGO_AREA, SAFE_CONTENT_AREA, HOST_CAM, HOST_INNER, holeClip, init, update, fit, setBlur };
})();

if (typeof window !== 'undefined') window.Stage = Stage;
