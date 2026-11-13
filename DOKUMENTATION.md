# Beat the M — Dokumentation

Technische Gesamtdokumentation des Projekts: Ausgangslage, Architektur, Datenmodell,
API-Referenz, Betrieb und aktueller Entwicklungsstand.

---

## 🔖 SESSION-ÜBERGABE — das hier zuerst lesen (auch am Anfang eines neuen Chats)

Dieser Block wird am Ende jeder Arbeits-Session aktualisiert. Er ist dafür da,
dass ein neuer Claude-Chat (oder du selbst) in 10 Sekunden weiß, woran gerade
gearbeitet wird — ohne den Rest der Doku lesen zu müssen.

**Zuletzt aktualisiert:** nach Mehrfach-Bretter / Text-Import / Frage-Bilder

**Funktioniert gerade:**
- ✅ Server (`server.js`) mit modularem State-Schema, inkl. `players[].avatar`,
  `activePlayerId` und Action `SET_ACTIVE_PLAYER`
- ✅ **Neues Overlay-Layout im Hauptspiel** (`overlay.html`/`overlay.js` nutzen
  jetzt `shared/stage.js`): Logo als PNG oben Mitte, Jeopardy-Board im
  Spielinhalt-Bereich, bei offener Frage bleibt das Board weichgezeichnet
  dahinter, **Spieler-Avatare unten** (statt Spieler-Facecams, max. 4),
  **eigene Facecam-Umrandung unten Mitte** (bündig am unteren Rand, transparent
  auch mit Hintergrundbild), aktiver Spieler **blinkt** in seiner Farbe
- ✅ Moderator: Logo-Upload + Facecam-Schalter (Einstellungen), Avatar-Upload
  pro Spieler (Tab „Spieler“), „Wer ist dran?“-Leiste im Tab „Spielbrett“
- ✅ **Facecam-Rahmen** dick (16 px) mit runden Innenecken; die Webcam wird in OBS
  auf den Innenbereich gelegt: **x 720, y 794, 480 × 270** (bei 1920 × 1080)
- ✅ Spielernamen im Avatar-Schild mittig, Punktestand darunter
- ✅ **9:16-Handy-Overlay** (`public/overlay-mobile.html` + `overlay-mobile.js`, 1080 × 1920, für TikTok-Clips):
  oben Facecam (Kamera-Innenbereich x 40, y 76, 1000 × 620), Mitte Frage (Text/Bild/Antwort, Schrift passt sich
  der Länge an; ohne Frage: Logo + Brettname), unten nur Spieler-Icons (aktiver blinkt); `?scores=1` zeigt
  zusätzlich Name + Punkte; schlichte Gewinner-Ansicht mit Konfetti. Nutzt denselben State wie das Haupt-Overlay.
- ✅ **Mehrere Bretter** (statt fester Runde 1/2): anlegen, benennen, löschen, live schalten
  (Header-Auswahl); Kategorienanzahl (1–8) und Punktwerte/Zeilen (1–8) pro Brett einstellbar
- ✅ **Text-Import**: ganzes Brett per Text füllen (`K1:F1: "Frage" , "Antwort"`), inkl. Export als Text
- ✅ **Bilder bei Fragen** (z. B. Flaggen): pro Frage, per Text-Import mit Bilder-Pool oder per
  „Bilder-Stapel“ je Kategorie; Overlay zeigt das Bild in der Frage-Karte
- ✅ Abgehakte Fragen: deckendes Grau mit Diagonalstrichen, Zahl durchgestrichen
- ✅ **Gewinner-Animation** (Strahlen, Konfetti, großer Avatar): startet automatisch,
  sobald **jede befüllte Frage (Text oder Bild) aller Bretter** abgehakt und die letzte geschlossen ist
  — leere Fragen/Bretter zählen nicht (abschaltbar: Einstellungen → „Spielende“); manuell per Knopf im Tab „Spielbrett“
  (`SHOW_WINNER`/`HIDE_WINNER`). Bei Gleichstand werden alle Punktbesten gezeigt.
- ✅ **Beichten** (`public/games/beichten/`): `moderator.html` (50 Beichten
  eintragen), `overlay.html` (Klick = aufdecken, Pfeile/Tasten = blättern);
  eigenes Login mit eigenem Token-Key (`beichten_auth_token`)
- ✅ Login/Auth, Farben, Glow-Effekt, Export/Import-Backup

**Bekannt offen / unvollständig:**
- 🚧 Layout weicht vom früheren Plan ab: Moderator-Cam sitzt **unten Mitte**
  (nicht oben links), es gibt **keinen** Active-Player-Badge oben rechts
  (Ersatz: Blinken des Avatars). `player.side` und `settings.logoText`/
  `showFacecams` werden nicht mehr verwendet.
- 🚧 Quiz-Arena-Anbindung: Avatare werden aktuell per PNG-Upload eingefügt;
  automatischer Import aus der Quiz Arena braucht deren Export-/API-Format
- 🚧 `games/jeopardy/` und `games/emoji/` leer (Jeopardy-Code liegt noch in
  `public/overlay.js`/`moderator.js`), Emoji-Rätsel hat nur State, keine UI
- 🚧 Beichten-Seiten laufen noch außerhalb der Stage-Shell (eigene Seiten)
- ⬜ Soundboard-UI, Mehrfach-Show-UI, restliche Spiele, Tastatur-Shortcuts

**Nächster konkreter Schritt (Vorschlag):**
→ Quiz-Arena-Anbindung (Format klären) **oder** Emoji-Rätsel-Oberfläche
(Punkt 4 aus [Abschnitt 12](#12-offene-baustellen--nächste-schritte)).

**So startest du damit einen neuen Chat:**
> "Hier ist der aktuelle Stand von Beat the M (ZIP/Doku im Anhang oder im
> Project). Mach jetzt weiter mit dem nächsten Schritt aus der
> SESSION-ÜBERGABE in DOKUMENTATION.md — nur dieser eine Punkt, sonst nichts."

---

**Stand dieser Dokumentation:** unmittelbar nach dem Beginn der Umstellung von
„einzelnes Jeopardy-Tool" auf „modulare Gameshow-Plattform". Der Umbau ist
**nicht abgeschlossen** — Details dazu im Abschnitt [10. Aktueller Status](#10-aktueller-status--wichtig-zuerst-lesen).

---

## Inhaltsverzeichnis

1. [Überblick & Ziel](#1-überblick--ziel)
2. [Technologie-Stack](#2-technologie-stack)
3. [Verzeichnisstruktur](#3-verzeichnisstruktur)
4. [Architekturprinzip](#4-architekturprinzip)
5. [Datenmodell (State-Schema)](#5-datenmodell-state-schema)
6. [Server & API-Referenz](#6-server--api-referenz)
7. [Frontend-Komponenten](#7-frontend-komponenten)
8. [Design-System (Farben, Glow, Facecams)](#8-design-system-farben-glow-facecams)
9. [Betrieb & Deployment](#9-betrieb--deployment)
10. [Aktueller Status — wichtig, zuerst lesen](#10-aktueller-status--wichtig-zuerst-lesen)
11. [Roadmap: geplante Spiel-Module](#11-roadmap-geplante-spiel-module)
12. [Offene Baustellen / nächste Schritte](#12-offene-baustellen--nächste-schritte)

---

## 1. Überblick & Ziel

**Beat the M** ist eine selbst gehostete Web-Anwendung für eine Live-Gameshow auf Twitch,
ursprünglich als Jeopardy-Klon gestartet, aktuell im Umbau zu einer **modularen
Plattform für mehrere Gameshow-Formate** (Jeopardy, Emoji-Rätsel, Beichten,
Höher-oder-Tiefer, Soundboard-Rätsel, Pixel Reveal, Zitate-Raten, Schnellantwort,
Guess-the-Year — siehe [Roadmap](#11-roadmap-geplante-spiel-module)).

Die Anwendung besteht aus zwei Ansichten, die live über einen eigenen kleinen
Node-Server synchronisiert werden:

- **Moderator-Ansicht** (`moderator.html`): passwortgeschütztes Kontrollpanel, mit
  dem eine oder mehrere Personen (auch von unterschiedlichen Orten/Rechnern aus)
  die Show steuern — Fragen anzeigen, Punkte vergeben, Design anpassen usw.
- **Overlay-Ansicht** (`overlay.html`): die reine Bildschirmausgabe im 16:9-Format,
  gedacht als **OBS-Browser-Quelle**. Zeigt Spielbrett, aktive Frage, Punktestand
  und Facecam-Platzhalter — ohne jegliche Steuerelemente.

Beide Ansichten lesen denselben zentralen Zustand (**State**) vom Server und werden
per **Server-Sent Events (SSE)** in Echtzeit aktualisiert: Klickt der Moderator eine
Frage an, erscheint sie sofort im Overlay — auch wenn Moderator und Overlay auf
komplett unterschiedlichen Rechnern/Netzwerken laufen (z. B. Moderator zuhause,
Overlay auf dem Streaming-PC eines Kollegen).

---

## 2. Technologie-Stack

Bewusst **minimalistisch und ohne externe Abhängigkeiten** gehalten:

| Bereich | Technologie |
|---|---|
| Server | Node.js, reines `http`-Modul (kein Express, kein `npm install` nötig) |
| Echtzeit-Sync | Server-Sent Events (SSE) über `/api/events` |
| Persistenz | JSON-Dateien auf der Festplatte (`data/state.json`, `data/shows/*.json`) — keine Datenbank |
| Frontend | Vanilla HTML/CSS/JavaScript, keine Frameworks, kein Build-Schritt |
| Auth | Einfaches Passwort → zufälliger Token (in-memory auf dem Server verwaltet) |
| Styling | Ein gemeinsames Stylesheet (`style.css`) mit CSS-Variablen für Theming |

**Warum keine Abhängigkeiten?** Damit die App überall mit nur `node server.js`
läuft (auch ohne Internetzugang für `npm install`), z. B. auf einem Laptop ohne
Setup-Aufwand, und ohne Kompatibilitätsprobleme bei Hosting-Anbietern.

---

## 3. Verzeichnisstruktur

```
jeopardy-stream/
├── server.js                  ← Der komplette Server: State, Reducer, HTTP-API
├── README.md                  ← Kurzanleitung für Endnutzer (Start, OBS-Setup)
├── DOKUMENTATION.md            ← Dieses Dokument
│
├── data/                       ← Laufzeitdaten (wird automatisch angelegt)
│   ├── state.json               aktuell "live" geladene Show (auto-gespeichert)
│   └── shows/                   abgelegte, benannte Shows (Mehrfach-Speicherstände)
│       └── <slug>-<timestamp>.json
│
└── public/                     ← Alles, was der Browser lädt
    ├── moderator.html            Moderator-Dashboard (Login + Steuerung)
    ├── moderator.js               … zugehörige Logik
    ├── overlay.html               Stream-Overlay (für OBS Browser-Quelle)
    ├── overlay.js                 … zugehörige Logik
    ├── style.css                  gemeinsames Stylesheet (Theme, Glow, Board, Facecams)
    ├── client.js                  gemeinsame Helfer (Login/Auth, SSE-Verbindung, Theme)
    │
    ├── shared/
    │   └── stage.js               ⚠ NEU, in Arbeit: globales Layout-/Facecam-System,
    │                                 soll von jedem Spiel-Modul wiederverwendet werden
    │
    └── games/                     ⚠ NEU, in Arbeit: Ordner für einzelne Spiel-Module
        ├── jeopardy/                (aktuell leer — Code liegt noch in public/overlay.js
        │                             und public/moderator.js, siehe Abschnitt 10)
        └── emoji/                   (aktuell leer — als nächstes Modul geplant)
```

### Status-Legende für die Tabelle unten

- ✅ fertig und funktionsfähig
- 🚧 begonnen, aber unvollständig / inkonsistent
- ⬜ noch nicht begonnen

| Datei/Ordner | Status | Beschreibung |
|---|---|---|
| `server.js` | ✅ | Bereits vollständig auf das neue modulare State-Schema umgestellt (siehe Abschnitt 5) |
| `public/style.css` | 🚧 | Enthält noch das **alte** 2-Slot-Facecam-Design (links/rechts). Neues 4-Facecam-Layout mit Moderator-Cam/Logo/Active-Player-Badge ist beschrieben, aber nicht implementiert |
| `public/shared/stage.js` | 🚧 | Existiert, implementiert aber noch das alte 2-Slot-Layout — nicht das zuletzt besprochene Layout (Moderator-Cam oben links, PNG-Logo, Active-Player-Anzeige, 4 Facecams unten) |
| `public/overlay.html` / `overlay.js` | 🚧 | Liest noch **direkt** `state.round1` / `state.round2` — funktioniert nicht mehr mit dem neuen Server-State (liegt jetzt unter `state.games.jeopardy.round1`) |
| `public/moderator.html` / `moderator.js` | 🚧 | Gleiches Problem: liest noch die alte, flache State-Struktur; Tabs sind noch nicht in einzelne Spiel-Module aufgeteilt |
| `public/games/jeopardy/` | ⬜ | Vorgesehen für den ausgelagerten Jeopardy-Code, aktuell leer |
| `public/games/emoji/` | ⬜ | Vorgesehen für das neue Emoji-Rätsel-Spiel, aktuell leer |
| `data/shows/` | ✅ (Server-seitig) | API zum Speichern/Laden mehrerer Shows ist im Server implementiert, aber in der Moderator-Oberfläche noch nicht angebunden |

---

## 4. Architekturprinzip

Die Plattform folgt einem einfachen **Client-Server-Sync-Modell**, keinem
klassischen REST-CRUD-Schema:

```
┌─────────────────┐        POST /api/action        ┌──────────────┐
│  Moderator-Tab   │ ───────────────────────────────▶│              │
│  (irgendein PC)  │                                  │   server.js   │
└─────────────────┘                                  │  (ein globaler│
                                                        │   State im    │
┌─────────────────┐        GET /api/events (SSE)      │   Speicher +  │
│  Overlay in OBS   │◀──────────────────────────────── │   JSON-Datei) │
│  (Streaming-PC)   │                                  │              │
└─────────────────┘                                  └──────────────┘
```

- Es gibt **einen einzigen State** auf dem Server (eine „Show", die gerade läuft).
- Jede Änderung (Frage öffnen, Punkte vergeben, Farbe ändern, …) wird als
  **Action** (`{ type, payload }`) an `POST /api/action` geschickt.
- Der Server wendet die Action auf den State an (reine Reducer-Funktion,
  siehe `applyAction()` in `server.js`), speichert ihn als JSON-Datei und
  **broadcastet den kompletten neuen State** an alle verbundenen Clients
  (Moderator-Tabs *und* Overlays) über SSE.
- Es gibt bewusst **keine granularen REST-Endpunkte** pro Feature — alle
  Zustandsänderungen laufen über denselben `/api/action`-Endpunkt mit
  unterschiedlichen `type`-Werten. Das hält den Server klein und macht neue
  Features (= neue `case`-Zweige im Reducer) einfach ergänzbar.

### Modularitätsprinzip (Zielbild, in Arbeit)

Das erklärte Ziel ist, dass **jedes Spiel ein eigenständiges Modul** ist:

- Server-seitig lebt der Zustand jedes Spiels unter `state.games.<spielId>`
  (bereits umgesetzt, siehe Abschnitt 5).
- Client-seitig soll jedes Spiel ein eigenes Overlay-Modul (`games/<id>/overlay.js`)
  und ein eigenes Moderator-Modul (`games/<id>/moderator.js`) bekommen, die sich
  in eine gemeinsame „Hülle" (Overlay-Shell bzw. Moderator-Shell) einklinken,
  anstatt dass jedes Spiel sein eigenes komplettes HTML-Dashboard mitbringt.
- **Facecams, Hintergrund, Glow-Design und Login/Auth sind global** und werden
  nicht von einzelnen Spielen dupliziert, sondern zentral in `shared/stage.js`
  bzw. `client.js` bereitgestellt — jedes neue Spiel bekommt sie automatisch.

*(Dieses Zielbild ist im Code angelegt, aber wie in Abschnitt 10 beschrieben
noch nicht durchgängig umgesetzt.)*

---

## 5. Datenmodell (State-Schema)

Der komplette Anwendungszustand ist ein einziges JSON-Objekt. Aktuelle Struktur
(aus `server.js`, Funktion `defaultState()`):

```jsonc
{
  "meta": {
    "name": "Neue Show",
    "updatedAt": 1234567890123          // Unix-Timestamp (ms) der letzten Änderung
  },

  "settings": {
    "primaryColor": "#0b1f6b",          // Board-Hintergrundfarbe
    "secondaryColor": "#f5c518",        // Akzentfarbe (Gold), auch Glow-Standardfarbe
    "boardTextColor": "#ffffff",
    "backgroundImage": "",              // dataURL, leer = transparent (für OBS)
    "logoText": "BEAT THE M",           // Text-Logo (Fallback)
    "logoImage": "",                    // dataURL eines hochgeladenen PNG-Logos (geplant, ersetzt Text-Logo)
    "showFacecams": true,
    "showModeratorCam": true,           // Facecam-Fenster oben links für den Moderator (geplant)
    "glowEnabled": true,
    "glowColor": "#f5c518",
    "glowBlur": 18,                     // px
    "glowIntensity": 70,                // 0–100 %
    "autoWinner": true                  // Gewinner-Animation automatisch nach der letzten Frage
  },

  "activePlayerId": null,               // id des Spielers, der gerade "dran" ist (Glow-Highlight, geplant)

  "activeGame": "jeopardy",             // welches Spiel-Modul aktuell im Overlay angezeigt wird

  "games": {
    "jeopardy": {
      "boards": [ /* beliebig viele Bretter, siehe unten */ ],
      "activeBoardId": "uuid",          // welches Brett gerade live im Overlay ist
      "activeQuestion": null,           // { boardId, catId, qId } oder null
      "showAnswer": false,
      "winnerShown": false,             // Gewinner-Animation im Overlay aktiv?
      "winnerTs": 0                     // Zeitstempel (startet die Animation neu)
    },
    "emoji": {
      "puzzles": [ /* siehe unten */ ],
      "activeId": null,
      "revealed": false
    }
  },

  "players": [
    {
      "id": "uuid",
      "name": "Spieler 1",
      "score": 0,
      "color": "#e74c3c",
      "side": "left"                    // "left" | "right" — Facecam-Zuordnung (Layout in Überarbeitung)
    }
    // …
  ],

  "soundboard": {
    "sounds": [
      { "id": "uuid", "name": "Applaus", "dataUrl": "data:audio/mp3;base64,…" }
    ]
  },

  "soundTrigger": null                  // { id, ts } — transientes Signal "spiel diesen Sound jetzt ab"
}
```

### Brett-/Kategorie-/Fragen-Objekt (Jeopardy)

```jsonc
{
  "id": "uuid",
  "name": "Runde 1",                  // Brettname (erscheint im Overlay oben rechts)
  "values": [100, 200, 300, 400, 500],// Punktwerte = Zeilen (1–8)
  "categories": [                     // 1–8 Kategorien
    {
      "id": "uuid",
      "name": "Kategorie 1",
      "questions": [
        {
          "id": "uuid",
          "value": 100,
          "question": "",
          "answer": "",
          "answered": false,
          "mediaType": "none",        // "none" | "image" (audio ist vorgesehen, noch ohne UI)
          "mediaData": "",            // dataURL — wird NICHT über SSE/GET /api/state verschickt
          "mediaName": "",            // ursprünglicher Dateiname (für Text-Export/-Import)
          "mediaVer": 0               // Zeitstempel der letzten Bildänderung (Cache-Busting)
        }
        // … je Punktwert eine Frage
      ]
    }
  ]
}
```

**Bilder:** Fragen-Bilder liegen als dataURL im Server-State (und damit in `state.json`/Backup),
werden aber nicht in jedem Live-Update mitgeschickt. Das Overlay lädt sie einzeln über
`GET /media/q/<frageId>?v=<mediaVer>` (vom Browser gecached). Der Moderator verkleinert Bilder
vor dem Upload auf max. 800 × 600 px.

**Migration:** Spielstände im alten Format (`round1`/`round2`) werden beim Laden automatisch
in zwei Bretter („Runde 1“, „Runde 2“) umgewandelt; Fragen, Punkte und offene Frage bleiben erhalten.

### Rätsel-Objekt (Emoji-Rätsel-Spiel)

```jsonc
{ "id": "uuid", "emoji": "🦁👑🌍", "solution": "Der König der Löwen" }
```

### Migration & Abwärtskompatibilität

`server.js` enthält zwei Mechanismen, damit bereits gespeicherte Daten
(z. B. eine ältere `state.json` auf Render) nicht verloren gehen:

1. **`migrateOldState()`** — erkennt das *alte, flache* Format (in dem
   `round1`/`round2` direkt auf oberster Ebene lagen, ohne `games`-Wrapper)
   und konvertiert es automatisch in das neue verschachtelte Format.
2. **`deepMergeDefaults()`** — ergänzt bei jedem Laden fehlende Felder
   (z. B. neu hinzugekommene Glow- oder Medien-Einstellungen) mit
   Standardwerten, damit ältere gespeicherte Stände nicht zu Fehlern führen.

Diese Migration läuft beim Serverstart (`loadState()`), beim Laden einer
gespeicherten Show (`/api/shows/load`) und beim Import eines Backups
(`IMPORT_STATE`-Action).

---

## 6. Server & API-Referenz

### Öffentliche Endpunkte (kein Login nötig — werden vom Overlay verwendet)

| Methode & Pfad | Beschreibung |
|---|---|
| `GET /api/state` | Aktueller State als JSON **ohne** Fragen-Bilddaten (`mediaData` leer); `?full=1` liefert alles inkl. Bilder (für Backup/Export) |
| `GET /media/q/<frageId>` | Bild einer Frage als normale Bilddatei (404, wenn keins gesetzt) |
| `GET /api/events` | Server-Sent-Events-Stream; sendet bei jeder Änderung den kompletten neuen State |
| `POST /api/login` | Body `{ password }` → bei Erfolg `{ ok:true, token }` |
| `GET /api/validate` | Prüft, ob der mitgesendete Token (`x-auth-token`-Header) noch gültig ist |

### Geschützte Endpunkte (gültiger `x-auth-token`-Header nötig)

| Methode & Pfad | Beschreibung |
|---|---|
| `POST /api/action` | Zentrale Aktion, Body `{ type, payload }` (siehe Action-Referenz unten) |
| `GET /api/shows` | Liste aller gespeicherten Shows (`id`, `name`, `updatedAt`) |
| `POST /api/shows/save` | Body `{ name }` — speichert den aktuellen State als neue Datei unter `data/shows/` |
| `POST /api/shows/load` | Body `{ id }` — lädt eine gespeicherte Show als aktuellen Live-State |
| `POST /api/shows/delete` | Body `{ id }` — löscht eine gespeicherte Show |
| `POST /api/shows/new` | Body `{ name }` — setzt den aktuellen State komplett zurück (neue leere Show) |

**Auth-Mechanismus:** `POST /api/login` prüft das Passwort (Umgebungsvariable
`MOD_PASSWORD`, Standard `admin123`) und gibt einen zufälligen Token
(`crypto.randomUUID()`) zurück. Der Token wird **nur im Arbeitsspeicher des
Servers** vorgehalten (`validTokens`-Set) — bei einem Server-Neustart sind
alle bestehenden Logins ungültig und müssen sich neu anmelden. Der Client
speichert den Token in `localStorage` und schickt ihn bei jeder Aktion im
Header `x-auth-token` mit.

### Action-Referenz (`type`-Werte für `POST /api/action`)

**Global**
| type | payload | Wirkung |
|---|---|---|
| `SET_SETTINGS` | beliebige Felder aus `settings` | merged in `state.settings` |
| `SET_ACTIVE_GAME` | `{ game }` | wechselt, welches Spiel im Overlay aktiv ist |
| `SET_SHOW_NAME` | `{ name }` | benennt die aktuelle Show um |
| `FULL_RESET` | – | setzt den kompletten State auf Werkszustand zurück |
| `IMPORT_STATE` | vollständiges State-Objekt | überschreibt den State (mit Default-Merge) |

**Spieler**
| type | payload |
|---|---|
| `ADD_PLAYER` | `{ name?, color?, side? }` |
| `REMOVE_PLAYER` | `{ id }` |
| `UPDATE_PLAYER` | `{ id, name?, color?, side? }` |
| `ADJUST_SCORE` | `{ id, delta }` (relativ, z. B. `+100`) |
| `SET_SCORE` | `{ id, value }` (absolut) |
| `RESET_SCORES` | – (alle Spieler auf 0) |

**Jeopardy (mehrere Bretter)**
| type | payload |
|---|---|
| `SET_ACTIVE_BOARD` | `{ boardId }` (Live-Brett im Overlay wechseln) |
| `ADD_BOARD` | `{ id?, name?, values? }` (neues Brett, 6 leere Kategorien; wird nicht automatisch live) |
| `DELETE_BOARD` | `{ boardId }` (mindestens ein Brett bleibt) |
| `RENAME_BOARD` | `{ boardId, name }` |
| `SET_BOARD_VALUES` | `{ boardId, values:[100,200,…] }` (1–8 Punktwerte = Zeilen; passt alle Kategorien an) |
| `ADD_CATEGORY` / `REMOVE_CATEGORY` | `{ boardId }` / `{ boardId, catId }` (1–8 Kategorien) |
| `EDIT_CATEGORY_NAME` | `{ boardId, catId, name }` |
| `EDIT_QUESTION` | `{ boardId, catId, qId, question?, answer? }` |
| `EDIT_QUESTION_MEDIA` | `{ boardId, catId, qId, mediaType, mediaData, mediaName }` (`mediaData: ''` entfernt das Bild) |
| `IMPORT_BOARD` | `{ boardId, replace?, boardName?, categories:{"1":"Name"}, questions:[{ k, f, question?, answer?, media?:{ name, dataUrl } }] }` (Text-Import; legt fehlende Kategorien an; ein noch leeres Brett wird auf die genutzten Kategorien zugeschnitten) |
| `OPEN_QUESTION` | `{ boardId, catId, qId }` |
| `CLOSE_QUESTION` | – (startet ggf. automatisch die Gewinner-Animation) |
| `TOGGLE_ANSWER` | – (blendet Antwort der offenen Frage ein/aus) |
| `MARK_ANSWERED` | `{ boardId, catId, qId, answered }` |
| `RESET_BOARD` | `{ boardId? }` (ohne `boardId`: alle Bretter; Punkte bleiben; blendet Gewinner aus) |
| `SHOW_WINNER` / `HIDE_WINNER` | – (Gewinner-Animation manuell ein/aus; automatisch via `settings.autoWinner`) |

**Text-Import-Format** (im Moderator, Tab „Fragen & Kategorien“ → „Schnell-Import per Text“; wird im Browser
geparst, dann als `IMPORT_BOARD` gesendet):
```
BRETT: Mein Brett                         # optional: Brettname
K1: Geografie                             # Kategoriename
K1:F1: "Hauptstadt von Frankreich?" , "Paris"
K2:F1: "Welches Land ist das?" , "Deutschland" , "deutschland.png"   # 3. Wert = Bild aus dem Bilder-Pool
```
Kommas in Anführungszeichen sind erlaubt, `""` oder `\"` ergibt ein Anführungszeichen, `\n` einen Zeilenumbruch,
typografische Anführungszeichen (`„…“`) und Felder ohne Anführungszeichen funktionieren auch. Bilder werden
über den Dateinamen zugeordnet (Groß-/Kleinschreibung, Endung und Sonderzeichen egal). Pro Kategorie gibt es
außerdem den Knopf „🖼 Bilder-Stapel“: mehrere Bilder wählen → jedes wird eine Frage, die Antwort wird aus dem
Dateinamen gebildet. „Aktuelles Brett als Text laden“ erzeugt das Format aus dem bestehenden Brett.

**Emoji-Rätsel**
| type | payload |
|---|---|
| `ADD_PUZZLE` | `{ emoji, solution }` |
| `EDIT_PUZZLE` | `{ id, emoji?, solution? }` |
| `DELETE_PUZZLE` | `{ id }` |
| `OPEN_PUZZLE` | `{ id }` |
| `CLOSE_PUZZLE` | – |
| `REVEAL_PUZZLE` | – (toggelt Lösung ein/aus) |

**Soundboard**
| type | payload |
|---|---|
| `ADD_SOUND` | `{ name, dataUrl }` |
| `RENAME_SOUND` | `{ id, name }` |
| `DELETE_SOUND` | `{ id }` |
| `PLAY_SOUND` | `{ id }` — setzt `state.soundTrigger`, das Overlay soll darauf mit Abspielen reagieren |

---

## 7. Frontend-Komponenten

### `public/client.js` — gemeinsame Basis für alle Seiten
- `sendAction(type, payload)` — POST an `/api/action` inkl. Auth-Token; bei
  `401` wird der gespeicherte Token gelöscht und `window.onAuthLost()`
  aufgerufen (falls definiert)
- `connectLiveState(onState)` — lädt einmalig `/api/state`, danach
  `EventSource('/api/events')` für Live-Updates
- `applyThemeColors(settings)` / `applyGlowSettings(settings)` — setzen
  CSS-Variablen (`--color-primary`, `--glow-blur`, …) auf `document.documentElement`
- `hexToRgbTriplet(hex)` — Hilfsfunktion für die Glow-Farbberechnung

### `public/shared/stage.js` — globales Layout-/Facecam-System *(in Überarbeitung)*
Soll von jedem Spiel-Overlay verwendet werden, um Header, Hintergrundbild
(inkl. „Loch" für transparente Facecam-Bereiche), Facecam-Fenster und einen
„sicheren Inhaltsbereich" (`SAFE_CONTENT_AREA`) bereitzustellen, in den das
jeweilige Spiel seinen Inhalt rendert. **Aktuell noch mit dem alten
2-Facecam-Layout (links/rechts) implementiert**, nicht mit dem zuletzt
besprochenen Layout (Moderator-Cam, PNG-Logo, Active-Player-Anzeige, bis zu
4 Facecams unten) — siehe Abschnitt 10.

### `public/overlay.html` / `overlay.js` — Stream-Ansicht
Fester 1920×1080-Canvas, der per JS-Transform (`scale`) in jede
Fenster-/OBS-Quellgröße eingepasst wird. Rendert Titel, Spielbrett bzw. offene
Frage, Facecam-Fenster und Scoreboard. **Liest aktuell noch direkt
`state.round1`/`state.round2`** statt `state.games.jeopardy.round1` — dadurch
mit dem aktuellen Server-State nicht kompatibel (siehe Abschnitt 10).

### `public/moderator.html` / `moderator.js` — Kontrollpanel
Tab-basiertes Dashboard: Spielbrett, Fragen & Kategorien, Spieler,
Einstellungen. Enthält:
- Login-Bildschirm (`doLogin()`, `checkExistingLogin()`, `startApp()`)
- Board-Steuerung mit Punktevergabe pro Spieler
- Fragen-/Kategorien-Editor
- Spielerverwaltung (Name, Farbe, Seite, Score)
- Einstellungen (Farben, Hintergrundbild, Glow-Regler, Backup Export/Import)

Auch hier: **liest noch die alte, flache State-Struktur** und ist nicht in
einzelne Spiel-Module aufgeteilt.

### `public/style.css` — gemeinsames Stylesheet
CSS-Variablen für Theming (`--color-primary`, `--color-secondary`,
`--glow-*`), Button- und Formular-Styles, Board-/Kachel-Design mit
animiertem Glow (`@keyframes glow-pulse`), Facecam-Rahmen-Design
(`.facecam-frame` — bewusst ohne Füllfarbe, damit der Bereich in OBS
wirklich transparent bleibt).

---

## 8. Design-System (Farben, Glow, Facecams)

### Farben & Theme
Über `settings.primaryColor` / `secondaryColor` / `boardTextColor` gesteuert,
als CSS-Variablen global angewendet (`applyThemeColors()`). Wirkt auf Board,
Kategorien-Header und Fragenkarte.

### Glow-Effekt
Ersetzt den früheren Titel-Glow: liegt jetzt auf Kategorien, Fragen-Kacheln
und der Fragenkarte. Einstellbar über `settings.glowEnabled/glowColor/
glowBlur/glowIntensity`, technisch per CSS `box-shadow` mit einer sanften
Pulsieren-Animation (`glow-pulse`), komplett abschaltbar über die Klasse
`no-glow` auf `<body>`.

### Facecam-Transparenz-Trick
Damit Facecam-Fenster **auch bei aktivem Hintergrundbild** transparent
bleiben (damit die echte Webcam-Quelle in OBS durchscheint), wird das
Hintergrundbild nicht direkt auf `<body>` gelegt, sondern auf eine eigene
Ebene (`.bg-layer`) mit einem CSS `clip-path` im `evenodd`-Modus, das
rechteckige „Löcher" exakt an den Facecam-Koordinaten ausschneidet. Das wurde
mit einem Test-Hintergrundbild und Pixel-Sampling verifiziert (Facecam-Innere
bleibt bei aktivem Hintergrund nachweislich transparent).

### Geplantes neues Layout (besprochen, noch nicht implementiert)
Zuletzt wurde ein neues Referenz-Layout festgelegt (angelehnt an ein
„Quiz Duell"-Beispielbild):

- **Oben links:** Facecam des Moderators (16:9)
- **Oben Mitte:** Logo als **hochladbares PNG** (kein Text mehr), mit
  empfohlener Bildgröße in der Moderator-Oberfläche dokumentiert
- **Oben rechts:** Anzeige, welcher Spieler „dran" ist, mit Farb-Glow
- **Unten:** bis zu **4 Facecams** (statt bisher 2 links/rechts), jeweils
  im 16:9-Format, etwas größer als zuvor
- **Fragenanzeige:** Das Spielbrett soll beim Öffnen einer Frage **nicht**
  durch ein separates Fenster ersetzt werden, sondern im Hintergrund sichtbar
  bleiben und **weichgezeichnet (blurred)** durchscheinen, während die
  Frage als Karte davor eingeblendet wird
- Kategorien bleiben wie im bestehenden Jeopardy-Modul: 6 Kategorien × 5
  Fragen (nicht wie im Referenzbild 4 Fragen)

`activePlayerId` und `settings.logoImage`/`showModeratorCam` sind im
Server-Datenmodell bereits als Felder angelegt, die zugehörige
Frontend-Umsetzung (Layout, Upload-UI, Blur-Effekt) steht noch aus.

---

## 9. Betrieb & Deployment

### Lokal starten
```bash
node server.js
```
Keine Installation von Paketen nötig. Standardmäßig auf Port 3000
(`PORT`-Umgebungsvariable überschreibbar).

- Moderator: `http://localhost:3000/moderator.html`
- Overlay (für OBS Browser-Quelle): `http://localhost:3000/overlay.html`

### Umgebungsvariablen
| Variable | Zweck | Standard |
|---|---|---|
| `PORT` | HTTP-Port des Servers | `3000` |
| `MOD_PASSWORD` | Passwort für die Moderator-Ansicht | `admin123` (unsicher — für Online-Betrieb unbedingt setzen!) |

### Online-Hosting (aktuell z. B. auf Render)
Damit auch entfernte Kolleg:innen moderieren können, läuft die App bereits
bei Render.com (Node-Web-Service, Start-Kommando `node server.js`).
Wichtige Punkte dabei:
- `MOD_PASSWORD` als Environment-Variable in Render setzen (sonst gilt der
  unsichere Standardwert).
- Kostenlose Render-Instanzen können bei Inaktivität neu starten — dabei
  geht der Inhalt von `data/` (lokale Festplatte) verloren, sofern kein
  persistentes Volume gebucht ist. Deshalb existiert die
  Export/Import-Backup-Funktion in den Moderator-Einstellungen sowie die
  Mehrfach-Show-API (`/api/shows/*`) auf dem Server.

### Datenpersistenz — wichtige Einschränkung
Alle Daten (Fragen, Bilder, Sounds als Base64 in JSON) liegen als **Dateien
auf der Festplatte des Servers** (`data/state.json`, `data/shows/*.json`).
Es gibt **keine Datenbank**. Das ist für den aktuellen Nutzungsumfang
(einzelne Show, gelegentliches Speichern) ausreichend, sollte aber bei
starkem Wachstum (viele Bilder/Sounds, viele parallele Shows) im Auge
behalten werden, da JSON-Dateien mit eingebetteten Base64-Mediendateien
schnell groß werden können.

---

## 10. Aktueller Status — wichtig, zuerst lesen

*(Kurzfassung siehe auch [SESSION-ÜBERGABE](#-session-übergabe--das-hier-zuerst-lesen-auch-am-anfang-eines-neuen-chats) ganz oben.)*

**Update:** Der ursprüngliche Bruch zwischen Server und Frontend (Server nutzte
schon das neue verschachtelte State-Schema, `overlay.js`/`moderator.js` lasen
noch die alte flache Struktur) ist **behoben**. Zusätzlich wurde der
Overlap-Bug zwischen Spielbrett und Facecam-Reihe gefixt (Kachel-Höhen sind
jetzt hart an die verfügbare Boardfläche gebunden, plus `overflow:hidden` als
Sicherheitsnetz). Beide Ansichten sind wieder durchgängig lauffähig und wurden
gegengetestet (Login, Board-Klick, Punktevergabe, Facecam-Abstand per
Pixelmessung verifiziert).

Weiterhin offen (unverändert seit dem letzten Stand):

1. `public/shared/stage.js` existiert bereits als Ansatz für das globale
   Facecam-/Layout-System, bildet aber noch das **alte** 2-Facecam-Layout ab
   (links/rechts neben dem Board), nicht das zuletzt besprochene neue Layout
   (Moderator-Cam oben links, PNG-Logo oben Mitte, Active-Player-Anzeige oben
   rechts, bis zu 4 Facecams unten, geblurrtes Board hinter der offenen Frage).
   **Wichtig:** `public/overlay.html`/`overlay.js` nutzen `shared/stage.js`
   aktuell noch gar nicht — die Facecam-Logik ist direkt in `overlay.html`/
   `overlay.js` eingebaut. Das Zusammenführen (Overlay auf `stage.js`
   umstellen) steht noch aus.
2. Die Ordner `public/games/jeopardy/` und `public/games/emoji/` sind als
   Zielstruktur angelegt, aber noch leer — der Jeopardy-Code liegt weiterhin
   direkt in `public/overlay.js` / `public/moderator.js`, das Emoji-Spiel
   ist serverseitig vorbereitet (State + Reducer-Actions), aber es gibt
   noch keine Oberfläche dafür.

**Für den produktiven Einsatz (Render-Deploy):** Der aktuelle Stand ist wieder
gefahrlos deploybar — Board, Facecams, Login und Punktevergabe funktionieren
durchgängig.

---

## 11. Roadmap: geplante Spiel-Module

Ursprünglich als Wunschliste für die Plattform formuliert. Status wie
zuletzt besprochen:

| # | Spiel | Kurzbeschreibung | Status |
|---|---|---|---|
| 1 | **Jeopardy** | 6 Kategorien × 5 Fragen, 2 Runden, optional Bild/Audio pro Frage | 🚧 Bestehend, im Umbau (siehe oben) |
| 2 | **Emoji-Rätsel** | Begriff/Film/Serie nur durch Emojis dargestellt, Lösung per Reveal | 🚧 Server-seitig vorbereitet, keine UI |
| 3 | **Beichten** | Verdeckte Karten, die sich beim Klick umdrehen; optional Chat-Voting (Echt/Fake, W/L, Red/Green Flag, 1–10) | ⬜ Nicht begonnen |
| 4 | **Höher oder Tiefer** | Zwei Begriffe/Personen vergleichen (Follower, Abos, Einwohnerzahl, …), Wert danach aufdecken | ⬜ Nicht begonnen |
| 5 | **Sound-Ratespiel** | Moderator spielt vorbereiteten Sound ab, Spieler erraten ihn, Lösung aufdeckbar | ⬜ Nicht begonnen *(unabhängig vom generischen Soundboard, s. u.)* |
| 6 | **Pixel Reveal** | Bild startet stark verpixelt, Auflösung wird schrittweise erhöht | ⬜ Nicht begonnen |
| 7 | **Wer hat das gesagt?** | Zitat anzeigen, optional Multiple-Choice, Lösung aufdecken | ⬜ Nicht begonnen |
| 8 | **Schnellantwort** | Timer-gestützte Fragerunde (30/60 Sek.), Moderator klickt durch vorbereitete Fragen | ⬜ Nicht begonnen |
| 9 | **Guess the Year** | Jahr eines Films/Spiels/Songs/Ereignisses erraten | ⬜ Nicht begonnen |

**Zusätzlich global geplante Systeme** (unabhängig von einzelnen Spielen):

| System | Beschreibung | Status |
|---|---|---|
| Soundboard | Sounds hochladen/benennen/löschen/abspielen, Wiedergabe im Overlay (für Stream-Ton) | 🚧 Server-seitig vorbereitet (`soundboard`-State, `ADD_SOUND`/`PLAY_SOUND`-Actions), keine UI |
| Mehrere Shows speichern/laden | Komplette Shows (Fragen, Design, Punkte, Medien) unter einem Namen ablegen und später wieder laden | 🚧 Server-API fertig (`/api/shows/*`), keine UI-Anbindung im Moderator-Dashboard |
| Import/Export als JSON-Backup | Backup der aktuellen Show als Datei herunterladen/wieder einspielen | ✅ Umgesetzt (Button in den Moderator-Einstellungen) |
| Automatisches Speichern | Jede Aktion wird sofort serverseitig persistiert | ✅ Umgesetzt (`saveState()` nach jeder Action) |
| Tastatur-Shortcuts | Wichtige Aktionen (nächste Frage, Reveal, Timer starten, Sound abspielen) ohne Maus steuerbar | ⬜ Nicht begonnen |
| Animationen (Karten-Reveal, Übergänge, Punkte-Einblendungen) | Hochwertige, dezente Effekte | ⬜ Nicht begonnen (aktuell nur der Glow-Pulse-Effekt) |

---

## 12. Offene Baustellen / nächste Schritte

In sinnvoller Reihenfolge, damit die App zwischendurch nutzbar bleibt:

1. **Frontend an neues State-Schema angleichen** — `overlay.js` und
   `moderator.js` auf `state.games.jeopardy.*` statt `state.round1` umstellen.
   Ohne diesen Schritt ist die App aktuell nicht funktionsfähig.
2. **Neues Facecam-/Header-Layout umsetzen** — `shared/stage.js` und
   `style.css` gemäß Abschnitt 8 („Geplantes neues Layout") fertigstellen:
   Moderator-Cam oben links, Logo-Upload oben Mitte, Active-Player-Anzeige
   oben rechts, bis zu 4 Facecams unten, Blur-Hintergrund bei offener Frage.
3. **Jeopardy-Code in `games/jeopardy/` auslagern**, um das Modulprinzip
   tatsächlich einzulösen (aktuell liegt der Code noch direkt unter `public/`).
4. **Emoji-Rätsel-Oberfläche bauen** (Server-Teil existiert bereits) — als
   Beweis, dass sich neue Spiele einfach ergänzen lassen.
5. **Soundboard-UI** (Upload/Verwaltung im Moderator, Wiedergabe im Overlay
   über `soundTrigger`).
6. **Mehrfach-Show-Verwaltung im Moderator-Dashboard** anbinden (Server-API
   ist fertig).
7. Danach: die restlichen Spiel-Module (Beichten, Höher/Tiefer, Pixel
   Reveal, Zitate-Raten, Schnellantwort, Guess-the-Year) sowie Tastatur-
   Shortcuts und Animationen, jeweils priorisierbar nach Bedarf.

---

*Ende der Dokumentation.*
