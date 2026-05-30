# NEON · SYNTH MODULE

Un **module de musique synthétiseur** tactile, esthétique **Tron / filaire néon** sur fond noir.

## Concept
- Fond noir + champ d'**étoiles 3D** minuscules qui avancent lentement face à l'écran (petits pixels).
- Par-dessus, plusieurs **formes géométriques filaires** flottent sur un plan fixe et tournent en 3D.
- **Tape une forme** → elle lance une **boucle chiptune synchronisée sur 8 temps**. **Re-tape** → elle s'arrête.
- Chaque forme = un instrument différent, mais **toutes calées sur la même horloge** : on superpose et on enlève les couches comme on veut.
- Familles de sons : **beats** (kick, snare, hi-hat), **basse**, **arpège / lead / stab chiptune**, **nappe synthétique**.
- À chaque émission, la forme propage des **ondes colorées** et des **explosions de pixels fins** → expérience visuelle colorée et fun.

## Utilisation
- Tape les formes pour activer/désactiver leurs boucles.
- Bouton **♪** (haut-droite) : couper / remettre le son.
- 100 % tactile, optimisé mobile.

## Technique
Canvas 2D + JavaScript vanilla. Audio entièrement synthétisé en temps réel (Web Audio API, séquenceur à anticipation pour un calage rythmique précis). Aucune dépendance, aucun fichier audio.

## Lancer en local
```bash
python3 -m http.server 8000   # puis http://localhost:8000
```

Déployé automatiquement sur **GitHub Pages** : https://gitonin.github.io/Gamin/
