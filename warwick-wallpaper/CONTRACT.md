# Warwick — Wallpaper Engine (web) · contrat technique

Fond d'écran animé 3D pour Wallpaper Engine (type « web »), cible **3440×1440 (21:9)**.
Tout tourne en local (CEF / Chromium, `file://`), donc **aucune ressource réseau** :
Three.js r128 et ses scripts `examples/js` sont dans `lib/`, scripts classiques (pas d'ES modules).

## Fichiers

| Fichier | Rôle | Propriétaire |
|---|---|---|
| `index.html` | page, ordre de chargement des scripts, titre optionnel | main |
| `js/main.js` | renderer, caméra et cadrage 21:9, boucle, scénario d'événements, état partagé, propriétés | main |
| `js/warwick.js` | modèle + rig + animation du personnage | personnage |
| `js/environment.js` | décor de Zaun, **toutes les lumières**, brouillard, fond, particules, sol | décor |
| `js/post.js` | post-traitement (bloom, tonemapping ACES, sRGB, étalonnage, vignette, grain, AA) | rendu |
| `js/wallpaper.js` | pont Wallpaper Engine (propriétés, audio, FPS, pause), `project.json`, polices locales, paquet | intégration |
| `dev/shoot.js` | captures headless pour vérifier le rendu | tous |

Chaque module est un script séparé qui **ajoute une fabrique** sur `window.WW`. `main.js` appelle chaque
fabrique dans un `try/catch` et retombe sur un remplaçant minimal si elle manque ou plante : un module
cassé ne doit jamais casser les autres.

## Repères de scène

- Unités ≈ mètres. Sol à `y = 0`. Warwick à l'origine, pieds au sol, il fait face à **+Z** dans son repère local,
  hauteur ≈ 2,6–2,9 (voûté). `main.js` le tourne de `rotation.y = -0.45` (trois-quarts, regard vers la gauche
  de l'écran, donc vers l'espace vide).
- Caméra (définie par `main.js`) : `PerspectiveCamera`, fov vertical ≈ 28°, position ≈ `(1.6, 1.05, 7.4)`,
  regarde `(0, 1.5, 0)`, avec un **décentrement optique** qui place Warwick vers **≈ 64 % de la largeur**.
  À 21:9 la moitié gauche de l'image est un espace de profondeur (ruelle de Zaun, brume, lumières) où
  restent les icônes du bureau : elle doit être belle mais calme, sans élément qui attire l'œil sous les icônes.
  Champ visible à la profondeur du personnage ≈ 8,6 m de large × 3,6 m de haut ; le décor doit remplir
  tout le cadre, y compris quand la caméra dérive de ± 0,4 m et que la souris décale la vue (parallaxe).
- Direction artistique : nuit dans les bas-fonds de Zaun. Brume chimique verte, puits de lumière froide qui
  tombent des grilles de Piltover au-dessus, métal humide, accents rouge sang. Style « low-poly facetté »
  (`flatShading`) mais riche en détails et en lumière, façon splash art. Fan-art, aucun logo Riot.

## Fabriques

```js
// js/warwick.js
WW.createWarwick(THREE, opts) -> {
  root,                     // THREE.Group, pieds à y=0, face à +Z
  update(state),            // appelé à chaque image
  getHeadWorldPosition(v),  // remplit un Vector3 (pour les effets de hurlement)
  setQuality?(q),
}
// js/environment.js
WW.createEnvironment(THREE, scene, opts) -> {
  update(state, camera),
  keyLight,                 // DirectionalLight qui projette les ombres (main règle la qualité d'ombre)
  setQuality?(q),
}
// js/post.js
WW.createPost(THREE, renderer, scene, camera, opts) -> {
  render(state),            // dessine l'image finale à l'écran
  setSize(w, h, pixelRatio),
  setQuality?(q),
}
// js/wallpaper.js
WW.createBridge(opts) -> {
  props,                    // valeurs courantes, déjà converties (voir tableau)
  onProps(cb),              // cb(props, changedKeys) ; appelé une fois tout de suite
  audio,                    // { level, bass, mid, high, beat } lissés, 0..1 (0 si pas d'audio)
  update(dt),               // lissage audio
  fpsLimit,                 // 0 = illimité
  paused,                   // booléen
  onPause(cb),
}
```

`opts` contient `{ quality: q, palette, camera }` ; `q` est un préréglage de qualité :

```js
{ name: 'high', scale: 1, shadows: true, shadowMap: 2048, particles: 1, bloomRes: 0.5, msaa: 4 }
```

## État partagé (`state`, construit par main.js, lu par tous)

| Clé | Type | Sens |
|---|---|---|
| `t`, `dt` | s | temps écoulé, durée de l'image (dt ≤ 0,05) |
| `hunt` | 0..1 | mode Traque sanglante (lissé) |
| `sniff` | 0..1 | il flaire, tête levée, naseaux (précède le hurlement) |
| `howl` | 0..1 | hurlement : buste redressé, tête vers le ciel, gueule ouverte, bras écartés |
| `swipe` | s ou -1 | secondes depuis le début d'un coup de griffe (0..1), -1 sinon |
| `flex` | 0..1 | il fléchit et fait crisser ses griffes |
| `growl` | 0..1 | grognement (entrée en traque) |
| `audio` | objet | `{ level, bass, mid, high, beat }` déjà multipliés par la réactivité choisie |
| `pointer` | {x,y} | souris lissée, -1..1 |
| `headPos` | Vector3 | position monde de la tête (mise à jour par main après `wolf.update`) |
| `q` | objet | préréglage de qualité courant |
| `particles` | 0..1+ | densité de particules (réglage × qualité) |
| `bloom` | 0..1 | intensité du bloom choisie |
| `palette` | {chem, blood} | `THREE.Color`, couleurs choisies par l'utilisateur |

## Propriétés Wallpaper Engine (clés de `project.json`)

| Clé | Type | Défaut | Libellé |
|---|---|---|---|
| `mode` | combo `zaun` / `hunt` / `cycle` | `cycle` | Ambiance |
| `events` | bool | true | Animations spontanées |
| `eventinterval` | slider 10–120 | 30 | Intervalle des animations (s) |
| `camerasway` | bool | true | Mouvement de caméra |
| `parallax` | bool | true | Parallaxe à la souris |
| `audioreact` | slider 0–100 | 60 | Réaction à la musique |
| `quality` | combo `low`/`medium`/`high`/`ultra` | `high` | Qualité |
| `bloom` | slider 0–100 | 60 | Halo lumineux |
| `particles` | slider 0–100 | 70 | Particules |
| `showtitle` | bool | false | Afficher le titre |
| `chemcolor` | color | `0.49 1 0.31` | Couleur chimique |
| `bloodcolor` | color | `1 0.17 0.17` | Couleur de la traque |

Dans un navigateur ordinaire, les mêmes clés se règlent par l'URL : `index.html?mode=hunt&quality=low`.
`?dev` expose `window.__ww` (état, déclencheurs) pour les captures.

## Vérifier

```
node dev/shoot.js --w 1720 --h 720 --out /tmp/x --states idle,howl,swipe,hunt
```
Rend la page dans Chromium headless (SwiftShader, donc lent : ne pas juger les FPS sur cette machine,
juger le coût par le nombre d'appels de dessin et de triangles que le script affiche).
