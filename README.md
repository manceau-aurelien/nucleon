# NUCLEON — Arène Quantique

Jeu d'arène inspiré d'*agar.io* où chaque joueur incarne le noyau d'une nuée d'électrons en orbite sans limite de capacité, avec combats tactiques, destruction mutuelle des électrons, 6 modes de jeu (dont escouades 20×3), 4 mondes et multijoueur pair-à-pair à 2 joueurs.

**Jouer en ligne :** https://manceau-aurelien.github.io/nucleon/

---

## Fonctionnalités

- **Nuée d'électrons sans limite** : aucun plafond maximum ! Un petit noyau produit très lentement (`+0.20 /s` au départ) et subit un ralentissement progressif s'il accumule trop d'électrons pour sa taille — il faut récolter des quarks et absorber d'autres noyaux pour faire grossir son cœur et accélérer fortement sa production sur jusqu'à 6 couches orbitales concentriques.
- **Annihilation 1-pour-1 & Siège** : les électrons ennemis s'entre-détruisent au contact ; ceux qui atteignent le cœur d'un noyau adverse drainent son intégrité jusqu'à l'absorber.
- **Bouclier intelligent (+30 % résistance)** : intercepte activement les électrons entrants en formant une phalange orientée vers la menace et réduit de 30 % les dégâts subis par le noyau.
- **6 Modes de jeu** :
  - `3 Équipes` — 3 armées de 17 noyaux (**Cyan**, **Magenta**, **Ambre**).
  - `Trios (20×3)` — **60 noyaux** répartis en **20 escouades soudées de 3** : vos 2 ailiers IA vous escortent, récoltent à vos côtés et concentrent leurs assauts sur vos cibles.
  - `Duos (25×2)` — **50 noyaux** répartis en **25 binômes tactiques**.
  - `2 Camps (30v30)` — Bataille frontale massive entre deux armées de 30 combattants.
  - `Solo` — Chacun pour soi (51 noyaux).
  - `Infini (Sans Zone)` — Arène permanente sans rétrécissement de zone avec réapparition continue des IA, idéale pour bâtir des nuées titanesques.
- **Durée de partie & Zone rouge configurables** : sur tous les modes (hors `Infini`), choisissez un préréglage (`~2 min`, `~4m30`, `~8 min`, `~15 min`) ou réglez finement **à partir de quand le cercle commence à rétrécir** (`0 s` à `10 min`) et **à quelle vitesse** (`4` à `60 px/s`), jusqu'à la fermeture rouge complète où tous les survivants perdent progressivement leurs PV.
- **4 Mondes jouables** :
  - `Espace Libre` — Arène ouverte classique.
  - `Labyrinthe` — Couloirs quantiques pour embuscades et blocage d'assauts.
  - `Piliers` — Monolithes magnétiques pour esquiver et contourner.
  - `Réacteurs` — 5 zones d'énergie boostant la production (`+85 %` à `+110 %`) et la régénération.
- **Multijoueur par code à 4 lettres** : créez un salon et partagez le code (ex : `KRAZ`) pour jouer en escouade, en armée ou en duel avec un ami via WebRTC (PeerJS), sans serveur dédié.

---

## Contrôles

| Action | Contrôle | Effet |
| :--- | :--- | :--- |
| **Déplacement** | `Souris` | Dirige le noyau vers le curseur |
| **Assaut** | `Clic Gauche` ou `A` / `Q` | Projette la nuée vers l'avant pour assiéger un noyau |
| **Bouclier intelligent** | `Clic Droit` ou `E` / `S` | Intercepte les électrons ennemis et réduit les dégâts de `30 %` |
| **Surcharge (Dash)** | `Espace` ou `Maj` | Propulsion rapide en sacrifiant quelques électrons |
| **Pause / Son** | `P` / `Échap` • `M` | Mettre en pause / couper ou activer le son |
