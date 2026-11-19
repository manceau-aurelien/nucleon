# NUCLEON — Arène Quantique

Jeu d'arène inspiré d'*agar.io* où chaque joueur incarne le noyau d'une nuée d'électrons en orbite, avec combats tactiques, destruction mutuelle des électrons, mode équipes à 3 couleurs, plusieurs mondes et multijoueur pair-à-pair à 2 joueurs.

**Jouer en ligne :** https://manceau-aurelien.github.io/nucleon/

---

## Fonctionnalités

- **51 combattants simultanés** (vous + 50 IA, ou vous + 1 ami + 49 IA).
- **Nuée d'électrons & annihilation 1-pour-1** : les électrons ennemis s'entre-détruisent au contact ; ceux qui atteignent le cœur d'un noyau adverse drainent son intégrité jusqu'à l'absorber.
- **Bouclier intelligent (+30 % résistance)** : intercepte activement les électrons entrants en formant une phalange orientée vers la menace et réduit de 30 % les dégâts subis par le noyau.
- **Recharge stratégique** : la production d'électrons demande du temps — même un noyau plus faible mais chargé peut renverser un géant épuisé après un duel. Absorber un noyau augmente votre capacité maximale et votre vitesse de production.
- **Équipes 3 Couleurs & Solo** : affrontements par équipes (**Cyan**, **Magenta**, **Ambre** — zéro tir allié et entraide des IA) ou chacun pour soi.
- **4 Mondes jouables** :
  - `Espace Libre` — Arène ouverte classique.
  - `Labyrinthe` — Couloirs quantiques pour embuscades et blocage d'assauts.
  - `Piliers` — Monolithes magnétiques pour esquiver et contourner.
  - `Réacteurs` — 5 zones d'énergie boostant la production (`+85 %` à `+110 %`) et la régénération.
- **Multijoueur par code à 4 lettres** : créez un salon et partagez le code (ex : `KRAZ`) pour jouer en équipe ou en duel avec un ami via WebRTC (PeerJS), sans serveur dédié. En mode **Solo**, l'option « Même équipe » (par défaut) vous place **en duo contre toutes les IA** : aucun dégât entre vous deux, victoire quand il ne reste que votre duo. « Adversaires » garde le chacun-pour-soi.

---

## Contrôles

| Action | Contrôle | Effet |
| :--- | :--- | :--- |
| **Déplacement** | `Souris` | Dirige le noyau vers le curseur |
| **Assaut** | `Clic Gauche` ou `A` / `Q` | Projette la nuée vers l'avant pour assiéger un noyau |
| **Bouclier intelligent** | `Clic Droit` ou `E` / `S` | Intercepte les électrons ennemis et réduit les dégâts de `30 %` |
| **Surcharge (Dash)** | `Espace` ou `Maj` | Propulsion rapide en sacrifiant quelques électrons |
| **Pause / Son** | `P` / `Échap` • `M` | Mettre en pause / couper ou activer le son |
