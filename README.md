# Pulsefield

Pulsefield ist unser Browser-Audio-Visualizer für Mobil und Desktop. Wir lesen den Klang im Labor — Mikrofon, Tab/System oder Datei — und zeichnen ihn auf eine Canvas2D-Fläche. Fünf Presets, ohne Reload umschaltbar.

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

Wir nehmen nur Quellen, die das Gerät oder der Browser wirklich hergeben. Keine erfundenen Pfade, kein „Spotify über Bluetooth abfangen“.

| Eingang | Was wir tun | Hinweis |
| --- | --- | --- |
| **Mikrofon** | `getUserMedia`, danach `enumerateDevices()` | Nach der Freigabe erscheinen die **audioinput**-Geräte des Systems (eingebaute Mics, USB, Headset, ggf. Stereo-Mix / Monitor). Eins wählen. |
| **Tab / System** | `getDisplayMedia` plus Audio, `systemAudio: 'include'` wo der Browser das kennt | **Nur Desktop-Chrome.** Im Teilen-Dialog Tab oder Bildschirm wählen **und** den Haken „Tab-Audio teilen“ / „Systemaudio“ setzen. Ohne Haken bleibt das Feld still. Auf dem Handy ist der Knopf sichtbar, aber deaktiviert (Nur Desktop). |
| **Datei** | Audio-Upload oder Datei auf das Feld ziehen | Der verlässliche Weg auf dem Handy, wenn der Raumton nicht passt. MP3, WAV, OGG, M4A, FLAC, AAC. Läuft in Schleife. |

Stop trennt den aktuellen Eingang. Einstellungen liegen im **Labor**-Sheet und bleiben in `localStorage`.

### Was der Browser nicht kann

- **Bluetooth-Wiedergabe (A2DP)** — Spotify oder andere Musik, die das Handy an einen Bluetooth-Lautsprecher schickt, ist kein Mikrofon. Der Browser kann diesen Strom nicht anzapfen. Das ist eine Plattformgrenze, kein fehlender Schalter.
- **Tab-Audio auf dem Handy** — `getDisplayMedia` liefert dort in der Regel keine nutzbare Audiospur. Deshalb bieten wir Tab/System nur auf dem Desktop an.
- **Anrufmodus bei Bluetooth-Headset (SCO/HFP)** — Sobald ein Headset-Mikrofon geöffnet wird, legt Android/iOS den Bluetooth-Weg oft auf das Telefonie-Profil. Musik wird dumpf oder wandert. Wir setzen `echoCancellation`, `noiseSuppression`, `autoGainControl` und `voiceIsolation` auf aus und starten den `AudioContext` mit `latencyHint: 'playback'`. Das weicht den Voice-Call-Pfad im Browser, **wenn** der Browser mitspielt. Das Betriebssystem kann SCO trotzdem erzwingen. Workaround: Telefonmikrofon wählen, Headset nur hören — oder eine Datei.

## Presets

Wir schalten ohne Reload. Jedes Preset bringt eigene Labor-Defaults mit. Wer Werte ändert, behält sie beim nächsten Besuch genau dieses Presets. **Auf Standard zurücksetzen** gilt für das aktive Preset (andere Presets behalten ihre Overrides). Qualität bleibt ein globaler Leistungsregler.

| Preset | Was wir zeichnen |
| --- | --- |
| **Bars Classic** | Klassisches Spektrum, Peak-Kappen, optional gespiegelt |
| **Radialring** | Speichen und konzentrische Ringe um die Mitte, Schockwellen auf Transienten |
| **Wellenband** | Zeitwelle als Band plus Nachzüge |
| **Partikelfeld** | 2D-Schwarm, Ausbrüche auf Peak/Bass |
| **Bloomraster** | Leuchtende Zellen, Welle vom Zentrum bei Hits |

Keine 3D-Kugel in diesem Stand — das kommt später.

## Labor

Im Sheet (unten auf Mobil, rechts auf Desktop), Preset auch oben im HUD:

- Preset-Wahl (fünf Canvas2D-Felder)
- Empfindlichkeit, Glättung, FFT-Größe
- Farbpalette, Bloom/Glow, Dichte (Balken / Speichen / Segmente / Partikel / Zellen), Spiegeln, Tempo, Hintergrund
- Qualität Niedrig / Mittel / Hoch — skaliert Auflösung, Glow und Anzahlen
- Auf Standard zurücksetzen (aktives Preset)

Sichtbar reaktiv auf Peak, RMS und Tief/Mitte/Hoch. Mobil startet auf Qualität Niedrig.

## GitHub Pages

Wir bauen mit Vite, `base` ist `/pulsefield/`. Der Workflow `.github/workflows/pages.yml` deployt bei Push auf `main` (und per `workflow_dispatch`) nach GitHub Pages.

Nach dem Merge:

1. Actions → **Deploy GitHub Pages** sollte einmal grün laufen.
2. Settings → Pages: Quelle **GitHub Actions**.
3. Öffnen: https://markovigele.github.io/pulsefield/

## Team

Wir halten den Ton nüchtern: Labor, Signal, Feld. Keine Marketing-Floskeln.
