// Copycats Sprüche (Sprechblase + Sprachaufnahme). mood: frech | wuetend | lachen | aufgeregt | fies
// Pro Situation viele Varianten; dialog.js sorgt dafür, dass sich nichts schnell wiederholt.
// Der ERSTE Eintrag bei learn_* ist auch der Text in der Akte/Zwischenbildschirm.
export const LINES = {
  round_start: { mood: 'frech', lines: [
    'Na, bereit für die nächste Runde?', 'Ich hab dich beobachtet. Die ganze Zeit!', 'Diesmal krieg ich dich, Clownsnase!',
    'Los geht\'s, Mango!', 'Mal sehen, was du heute falsch machst!', 'Tadaa! Da bin ich wieder!', 'Ich hab geübt. Vor dem Spiegel. Als du.',
    'Neue Runde, neues Glück. Für mich!', 'Ich weiß schon, wo du gleich hinläufst.', 'Achtung, Vorhang auf!',
    'Heute spiel ich dich besser als du!', 'Lauf ruhig. Ich find dich.',
  ] },
  hit_player: { mood: 'frech', lines: [
    'Treffer!', 'Erwischt!', 'Hab dich!', 'Das tat weh, oder?', 'Aua, sagst du jetzt.', 'Pling!',
    'Genau da!', 'Hab ich doch gewusst!', 'Nicht ausgewichen?', 'Kitzelt das?', 'Bumm!', 'Zack!',
  ] },
  win: { mood: 'lachen', lines: [
    'Vorhersehbar!', 'Genau da hab ich dich erwartet!', 'Das war zu einfach!', 'Ich kenne dich besser als du dich selbst!',
    'Hahaha! Nochmal? Nochmal!', 'Applaus bitte! Für mich!', 'Verbeugung! Danke, danke!', 'Du warst ein tolles Publikum!',
    'Das hab ich mir von dir abgeschaut!', 'Und Vorhang!', 'Hihi. Zu langsam, Clownsnase!', 'War das schon alles?',
  ] },
  lose: { mood: 'wuetend', lines: [
    'Glück gehabt!', 'Nächstes Mal kriege ich dich!', 'Ich lerne noch!', 'Das zählt nicht!', 'Na warte!', 'Ich hab mir alles gemerkt!',
    'Das war nur Aufwärmen!', 'Revanche! Sofort!', 'Grrr! Das merk ich mir!', 'Pff. Anfängerglück.', 'Moment, das war unfair!', 'Ich komme wieder. Schlauer.',
  ] },
  taunt: { mood: 'frech', lines: [
    'Schau mal, das bist du!', 'Na, gefällt dir mein Tanz?', 'Ich mach dich nach!', 'Lalala, du triffst mich nicht!', 'Guck mal, eine unsichtbare Wand!',
    'Hier drüben, Mango!', 'Juhu! Hallo!', 'Na? Kommst du?', 'Soll ich dir zeigen, wie das geht?', 'Einmal lächeln bitte!',
  ] },
  hurt: { mood: 'wuetend', lines: [
    'Aua!', 'Hey! Das war Glück!', 'Ach komm schon!', 'Meine Mütze!', 'Unfair!',
    'Autsch!', 'Nicht ins Gesicht!', 'Das gibt Rache!', 'Hey, das pikst!', 'Uff!',
  ] },
  flag_warn: { mood: 'aufgeregt', lines: ['Gleich kommt die Flagge! Die gehört mir!', 'Flaggenzeit! Juhu!', 'Gleich wird\'s spannend!', 'Die Flagge kommt! Wer zuerst da ist!'] },
  flag_spawn: { mood: 'aufgeregt', lines: ['Die Flagge gehört mir!', 'Meins, meins, meins!', 'Flagge! Ich renn schon!', 'Wettrennen!'] },
  tutorial: { mood: 'frech', lines: ['Übe ruhig! Ich schaue zu!'] },
  // Erkenntnisse (Zwischenbildschirm)
  learn_dodge_left: { mood: 'fies', lines: ['Du weichst immer nach links aus! Langweilig!', 'Links, immer nach links. Ich weiß das jetzt!', 'Schon wieder links? Ich ziel schon da hin!'] },
  learn_dodge_right: { mood: 'fies', lines: ['Du weichst immer nach rechts aus! Wie süß!', 'Immer nach rechts. Ich hab\'s gesehen!', 'Rechts ausweichen? Da wart ich schon!'] },
  learn_jump: { mood: 'fies', lines: ['Du springst ständig rum! Wie ein Flummi!', 'Hopp, hopp, hopp! Ich weiß, wann du springst!', 'So viel Gehüpfe! Ich ziel einfach höher!'] },
  learn_adad: { mood: 'fies', lines: ['Links, rechts, links, rechts! Ich kenne deinen Rhythmus!', 'Hin und her, hin und her. Ich tanz einfach mit!', 'Dein Zickzack hab ich durchschaut!'] },
  learn_heal_early: { mood: 'fies', lines: ['Du heilst dich viel zu früh! Angsthase!', 'Schon wieder die Spritze? Du bist ja kaum verletzt!', 'Immer so früh heilen. Das merk ich mir!'] },
  learn_heal_late: { mood: 'fies', lines: ['Du heilst dich immer erst ganz am Ende!', 'Du wartest mit der Spritze bis zum letzten Moment!', 'Kurz vor knapp heilen? Dann bin ich da!'] },
  learn_camper: { mood: 'fies', lines: ['Du versteckst dich gern! Ich finde dich trotzdem!', 'Campen, campen, campen. Gähn!', 'Du bleibst gern stehen. Praktisch für mich!'] },
  learn_rusher: { mood: 'fies', lines: ['Du stürmst immer blind nach vorne!', 'Immer mit dem Kopf durch die Wand, was?', 'Du rennst immer direkt auf mich zu. Danke!'] },
  learn_close_weak: { mood: 'fies', lines: ['Aus der Nähe triffst du gar nichts!', 'Nah dran bist du ganz zittrig!', 'Je näher ich komme, desto schlechter zielst du!'] },
  learn_far_weak: { mood: 'fies', lines: ['Auf Distanz triffst du gar nichts!', 'Von weitem bist du blind wie ein Maulwurf!', 'Weit weg? Da triffst du ja nix!'] },
  learn_peek_left: { mood: 'fies', lines: ['Du kommst immer links aus der Deckung!', 'Links rausgucken. Jedes Mal!', 'Ich weiß, auf welcher Seite du rauskommst. Links!'] },
  learn_peek_right: { mood: 'fies', lines: ['Du kommst immer rechts aus der Deckung!', 'Rechts rausgucken. Jedes Mal!', 'Ich weiß, auf welcher Seite du rauskommst. Rechts!'] },
  learn_flag: { mood: 'fies', lines: ['Du rennst immer sofort zur Flagge!', 'Flagge da, Mango weg. Vorhersehbar!', 'Du kannst der Flagge einfach nicht widerstehen!'] },
  learn_slide: { mood: 'fies', lines: ['Du rutschst so gerne! Ich jetzt auch!', 'Rutschpartie? Kann ich auch!', 'So viel Gerutsche! Ich mach\'s dir nach!'] },
  learn_dash: { mood: 'fies', lines: ['Dash, Dash, Dash! Das kann ich auch!', 'Zisch! Dein Dash ist jetzt auch meiner!', 'Du ruckelst so schnell rum. Ich jetzt auch!'] },
  learn_high: { mood: 'fies', lines: ['Du stehst so gerne oben! Ich weiß das!', 'Immer rauf aufs Dach, was?', 'Hoch oben bist du leicht zu finden!'] },
  learn_nothing: { mood: 'frech', lines: ['Noch weiß ich nicht viel über dich. Noch!', 'Ich schau dir weiter zu!', 'Hmm. Du bist schwer zu lesen. Noch!'] },
  inter_generic: { mood: 'frech', lines: [
    'Ich schreib alles auf!', 'Mein Notizbuch wird immer dicker!', 'Nächste Runde bin ich schlauer!', 'Ich hab da so eine Idee...',
    'Du wirst dich wundern!', 'Ich kenne jetzt deine Tricks!', 'Merk dir meine Worte!', 'Gleich geht\'s weiter. Freu dich!',
  ] },
  // Konter-Pläne (Copycat verrät, dass er dich durchschaut hat)
  counter_bait: { mood: 'fies', lines: ['Du stürmst immer rein? Dann warte ich hier auf dich!', 'Na komm, renn mir ruhig direkt vor die Nase!', 'Ich bleib hier sitzen. Du kommst ja eh.', 'Stürm ruhig los. Ich warte!'] },
  counter_flank: { mood: 'fies', lines: ['Campen bringt dir nix. Ich komm von der Seite!', 'Versteck dich ruhig. Ich nehme einen anderen Weg!', 'Schau lieber mal über die Schulter!', 'Ich schleich mich an!'] },
  counter_rushClose: { mood: 'frech', lines: ['Aus der Nähe triffst du nix. Also komm ich näher!', 'Nahkampf! Da bist du schlecht!', 'Ich komm ganz nah. Buh!', 'Kuscheln? Ich komm rüber!'] },
  counter_keepFar: { mood: 'frech', lines: ['Auf Distanz bist du blind. Ich bleib schön weit weg!', 'Von weitem triffst du ja nix!', 'Ich halt Abstand. Viel Glück!', 'Schön weit weg bleiben. Hihi.'] },
  counter_high: { mood: 'frech', lines: ['Du willst wieder nach oben? Da bin ich schon!', 'Heute gehört der Ausblick mir!', 'Ich nehm heute den Logenplatz!', 'Oben ist besetzt!'] },
  // Schwächen ausnutzen
  push_heal: { mood: 'aufgeregt', lines: ['Am Heilen? Jetzt komm ich!', 'Spritze? Zu spät!', 'Heilen? Nicht mit mir!', 'Pflaster drauf? Ich komm trotzdem!'] },
  push_reload: { mood: 'aufgeregt', lines: ['Nachladen? Schlechte Idee!', 'Magazin leer? Perfekt!', 'Klick, klick? Jetzt ich!', 'Leer geschossen? Hihi!'] },
  push_low: { mood: 'fies', lines: ['Nur noch ein bisschen Leben, was? Gleich hab ich dich!', 'Du wackelst ja schon!', 'Gleich ist Schluss, Mango!', 'Noch ein Treffer!'] },
  // Eigene Lage
  self_heal: { mood: 'wuetend', lines: ['Moment! Kurz verarzten!', 'Aua. Erst mal Pflaster drauf!', 'Auszeit! Kurz heilen!', 'Nicht schießen, ich heil mich!'] },
  self_rush_low: { mood: 'wuetend', lines: ['Egal! Du bist genauso kaputt wie ich!', 'Alles oder nichts!', 'Jetzt oder nie!', 'Wir sind beide fast hin. Los!'] },
  self_kite: { mood: 'frech', lines: ['Ich halt dich schön auf Abstand!', 'Fang mich doch!', 'Bleib mal schön da drüben!'] },
};
