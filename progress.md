Original prompt: baue einen flappy bird app clone

- Initialisiert leeres Repo fuer einen eigenstaendigen Flappy-Bird-Klon als statische Web-App.
- Geplante Kernpunkte: Canvas-Rendering, deterministische Update-Schleife, Tastatur- und Touch-Steuerung, Start-/Game-Over-Flow, Score, Fullscreen, Test-Hooks.
- Erste Implementierung angelegt in index.html, style.css und game.js. Lokaler Server auf Port 4173 gestartet, Syntaxcheck fuer game.js erfolgreich.
- Erster Browserlauf erzeugt saubere Screenshots, zeigte aber eine etwas zu harte und nicht reproduzierbare Pipe-Folge. Spiel wird auf deterministische RNG und mildere Pipe-Werte umgestellt.
- Verifizierte Browserlaeufe:
- `output/web-game-start/shot-0.png`: Startscreen sichtbar, Status `mode=start`.
- `output/web-game-restart/shot-0.png`: aktive Runde nach Neustart sichtbar, Status `mode=playing`.
- `output/web-game-score-2/shot-0.png` und `output/web-game/shot-0.png`: Kollision/Game-Over sichtbar, Status `mode=gameover`.
- Restpunkt: Score-Inkrement ist implementiert, aber im automatisierten Burst noch nicht mit einer erfolgreichen Pipe-Passage belegt.
