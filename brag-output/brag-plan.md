# Brag Plan: AeroTeam

## What is this app?
AeroTeam transforme le fichier Excel hebdomadaire de consignes d'une équipe de maintenance aéronautique (7 feuilles jours × 3 shifts, avions, tâches, leaders) en effectif du jour et consignes prêtes par avion — avec import Excel de charge, équipes, répartition et sync cloud.

## The angle
Le rituel ingrat du lundi — un Excel de consignes de 7 feuilles — devient une app vivante en un glisser-déposer. Le détail qui impressionne : l'app lit tout (jours, shifts, avions, tâches, et même les leaders repérés par fond bleu) et rend chaque jour lisible avion par avion. Film d'ops premium, sobre, français.

## Hook (first 2-3 seconds)
Fond nuit aéro (#0a0f1e, grille fine + halo sky) : le nom `CONSIGNES S40.xlsm` se pose, ligne « Chaque semaine, le même fichier. » — les lignes de la grille s'allument en sky.

## Key moments (the middle)
- Dépôt du fichier → compteurs qui défilent : 7 feuilles jours lues · 42 membres affectés · 12 blocs avion.
- Sélecteur de jour : les dates se posent une à une — LUNDI (2026-09-28) → DIMANCHE (2026-10-04).
- Effectif du shift Matin : cartes avion colorées, pastilles membres, ★ leaders en bleu ciel.
- Consignes du jour par avion : listes « A faire » prêtes pour le leader.

## Outro / punchline
« AeroTeam. Les consignes du jour, avion par avion. » — wordmark + « LUNDI 28/09 → DIMANCHE 04/10 ».

## User flow worth showing
Entrée : déposer `CONSIGNES S40.xlsm` → Action : l'app lit 7 jours × 3 shifts (jours, effectif, avions, consignes, leaders) → Résultat : LUNDI · Matin — effectif et consignes par avion, prêts à transmettre aux profils leaders.

## Tone
- Preset: polished
- Creative direction: quiet premium ops film, aviation at dawn; copy UI en français
- Interpretation: peu de scènes, longs holds, motion confiante et retenue, palette navy/sky, zéro blague.

## Format: landscape — 1920x1080
## Duration: 18s

## Visual identity (from the project)
- Background: #0a0f1e (nuit aéro) ; surfaces claires #f1f5f9
- Accent: #0ea5e9 (sky-500), secondaire #4f46e5 (indigo)
- Text: #e2e8f0 sur sombre ; #0f172a sur clair
- Display font: Inter / system-ui, bold (aucune police custom dans le projet)
- Body font: system sans (Tailwind par défaut)
- Strongest visual element: l'écran de connexion « nuit aéro » (grille + halos) et les cartes avion avec pastilles ★ leaders

## Share copy (draft)
« Le fichier Excel des consignes → l'effectif du jour, avion par avion. AeroTeam. » (données d'exemple : noms de membres fictifs)

## Audio direction
- Role: lit musical chaleureux + accents rares
- Music: `happy-beats-business-moves` (fourni) ; fade-in 0,3 s, bas sous le hook, montée au reveal, fade out propre
- Music treatment: cues lues depuis `assets/music/cues/` à la composition ; viser les cues forts pour le reveal et la séquence avions
- Music cue guidance: preset fourni — 1-3 cues forts pour reveal + cartes avion ; fenêtres de beat-grid pour les révélations séquentielles ; restraint note (tone polished)
- Audio-reactive treatment: subtile ; présence des cartes qui respire sur les temps, pas de barres de waveform
- SFX posture: sparse, calés sur le motion (drop du fichier, arrivées de cartes, ticks de compteurs)
- Audio-coupled moments: compteurs qui défilent, cartes avion une à une, sélection du jour
- Restraint rule: aucun whoosh gratuit, pas de voix

## Storyboard

### Scene 1 — Hook « le fichier » — 3s
Fond nuit aéro avec grille. Le nom `CONSIGNES S40.xlsm` s'écrit/arrive ; ligne « Chaque semaine, le même fichier. » en display bold. Les lignes de grille s'allument en sky au passage du texte.
Sequential/interaction: none
Audio intent: calme, focus ; le lit s'installe
Audio-coupled idea: tick discret sur l'arrivée du nom de fichier
Music: bed chaleureux, volume bas
Transition mood: soft → Scene 2

### Scene 2 — Reveal « l'import » — 4s
Recreation de la page Import consignes : zone de dépôt (bordure pointillée) qui reçoit la pastille fichier, puis 3 cartes stats : « 7 Feuilles jours lues », « 42 Membres affectés », « 12 Blocs de charge » — les chiffres défilent 0→valeur.
Sequential/interaction: yes — le fichier se dépose, puis les 3 cartes arrivent une à une avec les compteurs
Audio intent: récompense contenue, montée du bed
Audio-coupled idea: drop + 3 arrivées de cartes sur des temps ; compteurs qui tickent
Music: montée légère
Transition mood: clean → Scene 3

### Scene 3 — Highlights « le jour » — 7s
Le sélecteur Jour affiche les dates qui se posent (LUNDI 28/09 → DIMANCHE 04/10) ; arrêt sur LUNDI · Matin. Puis l'Effectif : cartes avion (F-GKXT, F-GSQB, F-GSPK) qui arrivent une à une avec membres en pastilles — ★ leaders en bleu ciel, en premier. Sous les cartes, une liste de consignes se remplit (« LEADER + ACL + IDT », « CAB SECU + PRELIM »).
Sequential/interaction: yes — dates une à une, cartes avion une à une, puis les lignes de consignes
Audio intent: rythme régulier, satisfaction
Audio-coupled idea: chaque carte avion = un accent ; les lignes de consignes se posent en fin de séquence
Music: plein, beat-grid pour les cartes
Transition mood: clean → Scene 4

### Scene 4 — Outro « avion par avion » — 4s
Fond nuit aéro : wordmark AeroTeam, ligne « Les consignes du jour, avion par avion. », sous-ligne « LUNDI 28/09 → DIMANCHE 04/10 ».
Sequential/interaction: none
Audio intent: résolution, fade
Audio-coupled idea: dernier accent sur le wordmark
Music: fade out
Transition mood: fin

**Music mood for this video:** warm corporate, confiant
**Audio summary:** lit chaleureux qui monte au reveal, accents sur les cartes avion, fade propre.

## Note données
Noms de membres fictifs à l'écran (ex. « A. MARTIN », « B. DIALLO ») ; immats plausibles (F-GKXT, F-GSQB, F-GSPK). Aucune donnée réelle de personne.
