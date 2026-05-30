# NEON · SYNTH MODULE

Un **module de musique synthétiseur** tactile, esthétique **Tron / filaire néon** sur fond noir.

## Concept
- Fond noir + champ d'**étoiles 3D** minuscules qui avancent lentement face à l'écran (petits pixels).
- Par-dessus, des **formes géométriques filaires** flottent sur un plan fixe et tournent en 3D.
- **Carrousel de 5 planches × 8 formes = 40 instruments**, chacun indépendant. **Glisse** ◄ ► pour changer de planche.
- **Tape une forme** → elle lance une **boucle chiptune synchronisée sur 8 temps**. **Re-tape** → elle s'arrête.
- Toutes les formes (même sur des planches différentes) sont **calées sur la même horloge** : on superpose les couches comme on veut, les boucles continuent quand on change de planche.
- Chaque planche a sa **propre gamme, progression d'accords, mélodies, palette et formes** → des ambiances radicalement différentes :
  - **ORIGIN** — chiptune entraînant (La mineur)
  - **ICE** — ambiant cristallin, sans batterie (Am9/maj7, cloches & nappes)
  - **ACID** — techno acide, basse 303 glissée, kick four-on-the-floor
  - **SUNSET** — lo-fi chaud & jazzy (Do majeur, Rhodes)
  - **DEEP** — drone cinématique sombre (mode phrygien, sub-grave)
- À chaque émission : **ondes colorées** + **explosions de pixels fins**.

## Utilisation
- **Tape** une forme pour activer/désactiver sa boucle.
- **Glisse** horizontalement (ou flèches ◄ ►) pour naviguer entre les 5 planches.
- **Slider de tempo** (bas) : règle le BPM en temps réel (60–160), tout reste synchronisé.
- Bouton **♪** (haut-droite) : couper / remettre le son.
- 100 % tactile, optimisé mobile.

## Technique
Canvas 2D + JavaScript vanilla. Audio entièrement synthétisé en temps réel (Web Audio API, séquenceur à anticipation pour un calage rythmique précis). Aucune dépendance, aucun fichier audio.

## Lancer en local
```bash
python3 -m http.server 8000   # puis http://localhost:8000
```

Déployé automatiquement sur **GitHub Pages** : https://gitonin.github.io/Gamin/
