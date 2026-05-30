# NEON WIREFRONT

Shoot'em up **3D filaire** optimisé mobile — style **Tron old school** (fond noir, traits vert fluo, esthétique pixel art).

## Le jeu
- **Page d'accueil** : vaisseau en filaire 3D qui tourne sur lui-même, titre néon et bouton **START** (touchez l'écran pour lancer).
- **En jeu** : votre vaisseau au premier plan avance dans un espace filaire minimal. Des ennemis aux **formes géométriques variées** (cube, tétraèdre, octaèdre, pyramide, diamant, prisme) foncent sur vous.
- Esquivez-les et détruisez-les au tir pour marquer des points. La vitesse et la fréquence d'apparition augmentent avec le score.

## Commandes (tactiles)
- En bas **à gauche** : boutons **◄ / ►** pour se déplacer.
- En bas **à droite** : bouton **▲ TIR** (maintenir = tir automatique).
- Au clavier (desktop) : flèches gauche/droite + espace.

## Lancer
Aucune dépendance, aucun build. Ouvrez `index.html` dans un navigateur, ou servez le dossier :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

Construit en Canvas 2D + JavaScript vanilla avec un moteur de rendu filaire maison (projection perspective).
