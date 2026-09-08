# Pulsefield

Pulsefield ist unser Browser-Audio-Visualizer für Mobil und Desktop. Wir lesen den Klang im Labor — Mikrofon, Tab/System oder Datei — und zeichnen ihn als **Bars Classic** auf eine Canvas2D-Fläche.

Live (nach Merge auf `main`): [https://markovigele.github.io/pulsefield/](https://markovigele.github.io/pulsefield/)

## Start

Voraussetzung: Node 22.

```bash
npm install
npm run dev
```

Die Dev-URL liegt unter `/pulsefield/` (gleicher Base-Pfad wie GitHub Pages):

`http://localhost:5173/pulsefield/`

Produktion lokal prüfen:

```bash
npm run build
npm run preview
```

Dann: `http://localhost:4173/pulsefield/`

## Eingänge

| Eingang | Was wir tun | Hinweis |
| --- | --- | --- |
| **Mikrofon** | `getUserMedia` | Direkter Raumton. Wir spielen ihn nicht über die Lautsprecher zurück, damit es nicht pfeift. |
| **Tab / System** | `getDisplayMedia` plus Audio | Einen Tab oder Bildschirm teilen **und** „Tab-Audio teilen“ aktivieren. Ohne diesen Haken bleibt das Feld still. |
| **Datei** | Audio-Upload | Fallback, wenn Mic oder Tab nicht passen. Die Datei läuft in Schleife. |

Stop trennt den aktuellen Eingang. Einstellungen liegen im **Labor**-Sheet und bleiben in `localStorage`.

## Mobil und Tab-Aufnahme

Auf dem Handy ist Tab-/Systemton oft nicht da oder kommt ohne Audiospur an. Das ist eine Browser-Grenze, kein Schalter bei uns. Für unterwegs: Mikrofon oder eine Datei. Mobil starten wir bewusst mit Qualität **Niedrig**.

Desktop (Chromium) ist der zuverlässige Weg für Tab-Audio. Firefox und Safari verhalten sich je nach Version anders — wenn der Dialog keinen Audio-Haken zeigt, nutzen wir Mic oder Datei.

## Labor

Im Sheet (unten auf Mobil, rechts auf Desktop):

- Empfindlichkeit, Glättung, FFT-Größe
- Farbpalette, Bloom/Glow, Balkenanzahl, Spiegeln, Tempo, Hintergrund
- Qualität Niedrig / Mittel / Hoch (Platzhalter für spätere Stufen)
- Auf Standard zurücksetzen

Ein Preset in diesem Stand: **Bars Classic**. Sichtbar reaktiv auf Peak, RMS und Tief/Mitte/Hoch.

## GitHub Pages

Wir bauen mit Vite, `base` ist `/pulsefield/`. Der Workflow `.github/workflows/pages.yml` deployt bei Push auf `main` (und per `workflow_dispatch`) nach GitHub Pages.

Nach dem Merge:

1. Actions → **Deploy GitHub Pages** sollte einmal grün laufen.
2. Settings → Pages: Quelle **GitHub Actions**.
3. Öffnen: https://markovigele.github.io/pulsefield/

## Team

Wir halten den Ton nüchtern: Labor, Signal, Feld. Keine Marketing-Floskeln.
