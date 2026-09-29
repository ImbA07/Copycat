# COPYCAT 🎭

Ein 1-gegen-1-Comic-Shooter im Browser. Du bist **Mango**, ein Ex-Clown mit explodierter Mähne.
Dein Gegner ist **Copycat**, ein nerviger Pantomime, der jede deiner Bewegungen beobachtet und
von Runde zu Runde lernt, wie du spielst. Anfangs spielt er vorsichtig und nutzt nur wenig von dem, was er
weiß – ab etwa Runde 15 wird er richtig gefährlich, und bis Runde 50 wird er taktisch immer schlauer (aber nie unbesiegbar).

## So spielt man
- Endlos-Runden: Jede gewonnene Runde gibt Punkte, bei der ersten Niederlage ist Schluss.
- Nach 90 Sekunden erscheint in der Mitte eine Flagge: 5 Sekunden allein in der Zone = Sieg.
- Jede Runde wird eine neue, faire (spiegelsymmetrische) Arena gebaut: Vorstadt, Schulhof, Supermarkt, Atomkraftwerk.
  Jede Karte wird automatisch geprüft: In den ersten Sekunden nach dem Start kann man sich nicht sehen.
- Gemeinsame Bestenliste (Top 10) mit Spitznamen, optional mit PIN geschützt.

| Taste | Aktion |
|---|---|
| WASD | Laufen |
| Shift | Sprinten (an/aus) |
| Leertaste | Springen |
| Strg | Ducken (beim Sprinten: Rutschen) |
| Q | Dash – blitzschneller Ruck in Laufrichtung (2 Ladungen, je 5 s) |
| R | Nachladen |
| E | Spritze (2 pro Durchgang, +1 nach 3 Runden ohne Schaden am Stück) |
| Linksklick / Rechtsklick | Schießen / Kimme & Korn |
| Esc | Pause |

Alle Tasten lassen sich in den Einstellungen ändern.

## Was Copycat lernt
Copycat startet in jedem Durchgang bei null. Besser wird er durch das, was er über dich lernt (`js/learner.js`),
und durch sein Taktik-Level, das bis Runde 50 wächst (`js/bot.js`):
- **Konter-Pläne** gegen deinen Stil: Stürmst du, lauert er dir auf. Campst du, kommt er von der Seite.
  Triffst du auf eine Distanz schlecht, sucht er genau die. Magst du hohe Plätze, besetzt er sie zuerst.
  Er sagt dir auch, dass er dich durchschaut hat.
- **Schwächen ausnutzen:** Heilst du, lädst du nach oder hast du kaum noch Leben, macht er Druck, statt wegzulaufen.
- **Kluges Heilen:** Ist er selbst angeschlagen, wägt er ab: heilen in Deckung oder alles auf eine Karte,
  wenn du genauso schlecht dran bist.
- deinen Hin-und-her-Rhythmus und wohin du ausweichst, wenn er schießt (damit zielt er dorthin, wo du *gleich* bist)
- auf welcher Seite du aus der Deckung kommst
- wohin du dich zurückziehst, wenn er dich aus den Augen verliert
- auf welcher Distanz du schlecht triffst (dort sucht er den Kampf)
- wann du heilst oder nachlädst (dann drückt er)
- deine Tricks (Springen, Rutschen, Dash) macht er nach, auch den Fass-Trick, sobald du ihn vorgemacht hast
- ob du bei der Flagge sofort losrennst

## Technik
- Reines HTML/JavaScript mit [three.js](https://threejs.org) (liegt in `vendor/`), kein Build-Schritt.
- 3D-Modelle von Quaternius und Kenney (CC0), siehe `assets/CREDITS.md`.
- Bewegungen aus der „Universal Animation Library“ von Quaternius (CC0), beim Laden auf die Figuren umgerechnet
  (`js/anim.js`, Daten in `assets/anims.json`, erzeugt mit `tools/bake_anims.mjs`). Die Füße bleiben beim Laufen
  am Boden; seitwärts/rückwärts wird die Schrittrichtung gedreht, der Oberkörper zielt weiter. Zielen, Nachladen
  und Spritze steuert eigene Skelett-IK (`js/characters.js`).
- Schüsse und Sichtlinien treffen die echte Form der Objekte (Lücken in Zäunen, Bänken usw. lassen Kugeln durch),
  Laufen nutzt einfache Boxen (`js/world.js`).
- Comic-Look: Toon-Shading plus Umrisse per Nachbearbeitung (`js/toon.js`).
- Soundeffekte und Musik werden live im Browser erzeugt (`js/audio.js`).
- Copycat spricht echtes Deutsch (Piper-Stimme „Thorsten emotional“, je nach Stimmung frech/wütend/überrascht, erzeugt mit `tools/gen_voices.py`), die Sprüche stehen in `js/lines.js`. Mango ist stumm.
- Bestenliste: Supabase-Tabelle `copycat_scores`, Zugriff nur über abgesicherte Datenbank-Funktionen (`supabase/copycat_leaderboard.sql`).

## Lokal starten
```
python3 -m http.server 8000
```
Dann http://localhost:8000 öffnen.
