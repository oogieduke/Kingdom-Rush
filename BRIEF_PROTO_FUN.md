# BRIEF PROTO 2 — "Fun-first"

**À destination de Claude Code**
**Projet :** prototype de validation du *fun*
**Statut du proto 1 :** complet, jouable, propre — mais le cœur de gameplay n'a pas été validé comme satisfaisant. On le met en pause, on n'y touche pas.

---

## 1. POURQUOI CE PROTO

Le proto 1 a empilé les systèmes (saisons, stress, corruption, événements, bâtiments) sans qu'on ait jamais validé que le **geste central** — dessiner une zone, voir partir une expédition, encaisser le résultat — est satisfaisant en soi.

Ce proto 2 isole ce geste et le polit à mort. Tout le reste dégage. Si le cœur est fun ici, on saura qu'il vaut la peine d'être habillé. Si non, on aura économisé des semaines d'itération sur des couches qui ne sauveraient rien.

**On ne réécrit pas le proto 1. On fait un projet séparé, neuf, minimal.**

---

## 2. L'OBJECTIF EN UNE PHRASE

> Valider que dessiner une zone sur la carte, lancer une expédition et la voir se résoudre est **fun en soi**, sans qu'aucune autre mécanique ne soutienne le truc.

C'est le seul critère de succès de ce proto. Tout choix qui ne sert pas cet objectif doit être coupé.

---

## 3. SCOPE — CE QUI EST DEDANS

### 3.1 La carte

- Grille **rectangulaire** centrée sur le château (taille à calibrer, ~15×15 pour démarrer)
- **Cases biomes consommables** : blé, bois, pierre, eau, or
  - Chaque case a un nombre fini de récoltes possibles avant épuisement (ex : blé 3, bois 5, pierre 5, eau infini, or 1)
  - L'état d'épuisement est **visible** : la case change visuellement à chaque récolte (couleur qui pâlit, herbes jaunies, terre nue à la fin)
- **Maisons** : disséminées sur la carte. Une expé qui passe à proximité a une chance de revenir avec une recrue
- **Camps de monstres** : disséminés. Une expé qui passe à proximité a une chance de subir une attaque
- **Cases vides** (terrain neutre, ni ressource ni danger)
- Pas de fog of war complexe : tout est visible dès le début. On simplifie.

### 3.2 Le complexe central

Pas un château isolé : un **petit complexe vivant** au centre de la grille.
- **Château 3×3** au centre
- **Caserne** dessinée juste à côté (ou dessous)
- **Maison de civils** dessinée juste à côté (ou dessous)
- Les bâtiments se **peuplent visuellement** à mesure que la pop grandit : paysans dans/autour de la maison, soldats près de la caserne. Le complexe *est* la jauge de population.

### 3.3 La population

- **Démarrage : 2 paysans, 0 soldat**
- Recrutement uniquement via les expéditions qui frôlent des maisons
- À chaque retour avec recrue : le perso reste à la porte du château, bulle avec deux icônes (fourche / épée), le joueur **drag-and-drop** vers maison ou caserne pour assigner
- Si pas assigné dans les 3 prochaines expéditions, le perso part. Pas de timer agressif, juste une décision implicite.

### 3.4 Le geste central — sélection rectangulaire

- Drag souris/tactile pour dessiner un rectangle sur la carte
- **Taille maximale = nombre de paysans dispo** (2 paysans = max 2 cases ? ou 2×2 ? à calibrer au feeling)
- Pendant le drag, **affichage live à l'intérieur de la zone** :
  - Sur chaque case ressource : `+3 blé`, `+2 bois`, etc. (selon le potentiel de la case)
  - Sur chaque case monstre : icône menace
  - Sur chaque maison voisine : icône recrue potentielle
- Pendant le drag, **un trait polyline** se trace en live du château vers la zone sélectionnée
  - Le polyline est un *vrai chemin physique*, pas case-par-case — il glisse fluidement
  - Il **change de couleur** par segment selon le voisinage qu'il traverse :
    - Rouge cassé / pointillés rouges → près d'un camp de monstres
    - Vert chaud → près d'une maison
    - Doré → près d'une ressource précieuse (or notamment)
    - Neutre (brun parchemin) → terrain vide
  - Sur le tracé, des **icônes "?"** apparaissent aux endroits où un événement *peut* tomber. Plus la zone est loin, plus il y a de "?". Le nombre est lisible à l'œil ; le contenu est mystère.

### 3.5 Le départ

Au release du drag :
1. **Zoom doux** entre château et zone sélectionnée (~400-600ms, ease-out)
2. Pendant le zoom, les sprites paysans/soldats **sortent du château** et s'alignent devant la porte
3. La caravane s'engage sur le polyline et **avance pas-à-pas** (un pas par tick visuel court, ~150-200ms par pas)
4. **Aucun popup, aucune modale.** Tout se passe sur la carte.

### 3.6 La résolution sur la carte

- **Récolte** sur une case ressource : petit "ding", chiffre flottant qui monte (`+1 blé`), la case change d'état si elle s'épuise
- **Combat** sur ou près d'un camp de monstres : mini-animation cartoon courte (1-2 sec), résultat visible (X paysans/soldats survivent)
- **Recrue** près d'une maison : nouveau sprite rejoint le groupe pendant la marche
- **Event aléatoire** sur une icône "?" : mini-anim + chiffre flottant + **toast discret en bas** qui logue l'event en une ligne
- **JAMAIS** de popup qui interrompt le voyage

### 3.7 Le retour

- La caravane revient au château pas-à-pas
- Les ressources gagnées **pleuvent dans les compteurs** (animation des chiffres qui montent)
- Les sprites rentrent dans le château
- Si recrue : le perso reste devant la porte, attente, bulle d'assignation (cf. 3.3)

### 3.8 La progression

- Plus de paysans → zones plus grandes possibles → expés plus loin et plus juteuses
- Soldats → capacité à attaquer/tuer les monstres et débloquer des cases qui leur étaient inaccessibles
- Le monde se ferme : les cases proches s'épuisent, on est forcé d'aller plus loin → plus d'events possibles → plus de risques et d'opportunités

C'est tout. Pas d'autre vecteur de progression dans ce proto.

---

## 4. SCOPE — CE QUI EST EXPLICITEMENT EN DEHORS

À ne **pas implémenter** dans ce proto :

- ❌ Stress du roi, mortalité du roi, vieillissement
- ❌ Saisons, météo, événements saisonniers
- ❌ Corruption des zones surexploitées
- ❌ Fog of war (carte entièrement visible dès le départ)
- ❌ Bâtiments construits par le joueur (la caserne et la maison sont là dès le départ)
- ❌ Économie saisonnière, coûts récurrents
- ❌ Narratif scripté, journal d'expédition
- ❌ Conditions de fin / game over (la session tourne en boucle, on coupera plus tard)
- ❌ Tutoriel, popups d'onboarding
- ❌ Score audio élaboré (juste du sound design ponctuel sur les événements clés)
- ❌ Multi-expéditions simultanées
- ❌ Save / load

Si une feature ne fait pas explicitement partie de la section 3, elle n'est pas dans le proto. Au moindre doute, on demande avant d'ajouter.

---

## 5. LES 3 MOMENTS DE JUICE — À POLIR À MORT

Tout le polish budget va dans ces trois moments. Si l'un des trois est tiède, le proto rate sa mission.

### 5.1 Le drag de sélection (le moment "calcul")

C'est là que le joueur teste la map, sent les options, prend sa décision.

**Doit être satisfaisant :**
- Le rectangle qui se dessine snap aux cases avec un léger bounce
- **Marching ants** crispy sur le contour (animation pointillée qui tourne)
- Les chiffres de ressources apparaissent en **fade rapide** au moment où la zone se stabilise (pas pendant le drag continu — sinon ça clignote)
- Le polyline se redessine **en temps réel** à chaque déplacement du curseur, segments colorés inclus
- Le compteur d'événements ("?") se met à jour en live
- Léger son discret au snap (clic feutré, pas agressif)
- Le release valide tout d'un coup, pas de double-confirmation

### 5.2 Le départ et le voyage (le moment "spectacle")

C'est là que le joueur lâche le contrôle et regarde son pari se jouer.

**Doit être satisfaisant :**
- Zoom doux et fluide, façon "on penche la tête sur une carte de table"
- Sprites paysans/soldats qui **sortent du château un par un** avec petite cascade temporelle (50ms entre chacun)
- Marche pas-à-pas avec un *thump* discret à chaque pas (sound design feutré)
- Les events sur la route se résolvent **sur place**, en 1-2 sec max chacun
- La caméra suit doucement la caravane, ou reste sur la zone — à tester, pas figé d'avance
- Aucune coupure, aucune modale. C'est **un seul plan séquence** du release jusqu'au retour.

### 5.3 Le retour et l'assignation (le moment "récompense")

C'est là que le joueur encaisse, et où il sent que son royaume *grandit*.

**Doit être satisfaisant :**
- Les chiffres ressources qui **montent** dans les compteurs avec petite anim et son satisfaisant (pas un "+3" sec, un "tic-tic-tic" qui s'incrémente)
- Si recrue : le perso s'arrête à la porte, **lève la tête**, bulle qui pop avec deux icônes claires
- En hover sur le perso recrue : il se "soulève" légèrement
- Drag du perso : les bâtiments compatibles (caserne, maison) **glow doré** doucement
- Drop sur un bâtiment : le perso y entre, petite anim, le bâtiment "respire" un coup
- Si pas assigné, il reste planté là, visible, légèrement transparent au fil des expés pour signaler qu'il va finir par partir

---

## 6. CONTRAINTES TECHNIQUES

### 6.1 Stack

Réutiliser la stack du proto 1 — **TypeScript + Vite + Pixi.js v8 + Zustand + CSS pur pour les rares overlays**. Voir `BRIEF_CODE.md` du proto 1 pour les détails.

### 6.2 Langage visuel

Réutiliser tel quel les tokens du `BRIEF_DESIGN.md` du proto 1 :
- Palette parchemin warm
- Typo Cinzel + Manrope (ou équivalents)
- Pixel art simple, pas hyper détaillé
- Esthétique parchemin chaud avec accents saturés ponctuels

**On ne réinvente pas le visuel.** On capitalise sur ce qui a été posé.

### 6.3 Architecture

- État pur dans Zustand, lu par le rendering Pixi
- Logique métier (résolution d'expé, calcul de path, tirage d'events) **séparée du rendu**, testable en isolation
- RNG via `seedrandom` pour pouvoir reproduire les sessions

### 6.4 Pas de localStorage

Comme dans le proto 1, ne pas utiliser `localStorage` (incompatible avec certains contextes de preview). État en mémoire uniquement.

---

## 7. APPROCHE

### 7.1 Méthode

Incrémentale et **playable-first**. À chaque palier, le proto doit être jouable, même grossièrement, avant d'ajouter la couche suivante. On ne construit pas en silos.

### 7.2 Découpage suggéré (Claude Code peut proposer mieux)

1. **Setup + carte affichée** : grille avec biomes statiques, château + caserne + maison au centre. Aucune interaction.
2. **Geste de sélection nu** : on peut dessiner un rectangle, marching ants, snap aux cases. Pas de chiffres, pas de polyline.
3. **Affichage live dans la zone** : chiffres ressources, icônes monstre, "?".
4. **Polyline live** : le chemin se trace pendant le drag, segments colorés.
5. **Lancement et voyage** : zoom, sprites qui sortent, marche pas-à-pas le long du polyline.
6. **Résolution sur la carte** : récoltes, combats simples, events, toast discret.
7. **Retour et compteurs** : les ressources rentrent, les chiffres montent.
8. **Recrutement et assignation** : maisons sur la carte, recrue au retour, drag-and-drop.
9. **Consommation des cases** : épuisement progressif des biomes, état visuel qui change.
10. **Polish pass** : on revient sur les trois moments clés et on les peaufine au feeling.

À chaque palier, **on joue, on sent, on ajuste**. Pas de marche forcée.

### 7.3 Question à se poser à chaque feature

> Est-ce que ça sert l'objectif unique (cf. section 2) ? Si non, on coupe.

---

## 8. PREMIÈRE SESSION

**Message d'ouverture proposé :**

> Salut Claude. On démarre un nouveau projet : le proto 2 d'un jeu auto-battler. Le proto 1 existe (jouable mais pas fun), on n'y touche pas, on repart à neuf.
>
> Voici le brief : `BRIEF_PROTO_FUN.md`. Lis-le entièrement. Le `BRIEF_CODE.md` et `BRIEF_DESIGN.md` du proto 1 sont aussi disponibles pour la stack et le langage visuel — on les réutilise.
>
> Objectif de cette session : palier 1 — setup du projet et affichage statique de la carte (grille avec biomes, complexe central château + caserne + maison). Aucune interaction encore.
>
> Propose-moi la structure du projet et le `package.json`. J'attends ton OK avant les installs.

---

**Le seul truc qui compte dans ce proto : est-ce que c'est fun ?**

Tout le reste est secondaire.
