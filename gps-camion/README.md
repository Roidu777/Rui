# GPS Camion 🚛

GPS poids lourd dans le navigateur, en un seul fichier (`index.html`), sans compte ni clé d'API.

## Fonctions
- **Pensé pour les camions porteurs** : modèles de départ porteur 12 t (2 essieux), 19 t (2 essieux, réglage par défaut), 26 t (3 essieux), 32 t (4 essieux), plus semi 44 t et VUL 3,5 t. On corrige ensuite avec les vraies valeurs du camion : hauteur (point le plus haut, groupe frigo compris), largeur, longueur, MMA (case F.2 du certificat d'immatriculation), essieux, charge par essieu, ADR, vitesse max. Le gabarit est mémorisé.
- **Remorque attelée** (option) : MMA et essieux de la remorque, longueur de l'ensemble. L'itinéraire, les limitations et la catégorie de péage sont calculés pour l'ensemble.
- **Jusqu'à 3 itinéraires** au choix, avec péages / autoroute / ferry signalés. Options pour éviter péages, autoroutes, ferrys.
- **Pauses réglementaires (UE)** : une pause de 45 min toutes les 4 h 30 de conduite et un repos après 9 h, placés sur la carte, avec la durée totale pauses comprises.
- **Guidage en temps réel** : position GPS, instruction suivante et distance, voix en français, alerte de survitesse, heure d'arrivée, recalcul automatique en cas de sortie d'itinéraire, compte à rebours avant la pause obligatoire, écran maintenu allumé.
- Recherche d'adresse avec suggestions (Photon) et recherche de secours sur Entrée (Nominatim) si les suggestions ne répondent pas. Adresses belges dans l'ordre belge (« Rue de la Loi 16 »), bouton « Ma position », clic droit (ou appui long) sur la carte pour choisir départ/arrivée.
- Si le départ ou l'arrivée tombe dans une rue interdite aux PL, le point est accroché à la route accessible la plus proche.
- **Rues interdites signalées par le chauffeur** : les interdictions viennent d'OpenStreetMap, qui ne contient pas tous les panneaux (par exemple un C23 « 3,5 t » posé par une commune). Le bouton ⛔ (dans la feuille de route, pendant le guidage, ou par appui long sur la carte) marque une rue comme interdite aux camions : elle est évitée dans tous les trajets suivants, l'itinéraire est recalculé, et l'appli prévient si un trajet y passe encore. La liste se gère dans Options, avec un lien « Signaler à OSM » pour corriger la carte pour tout le monde. La rue de départ ou d'arrivée n'est jamais bloquée (desserte locale).
- Chaque itinéraire proposé indique ses grands axes (« via E411 · N25 · N240 ») pour choisir en connaissance de cause.

## Précision Belgique 🇧🇪
L'itinéraire est analysé tronçon par tronçon (région, type de route, limitation affichée, tunnels) :

- **Limitation applicable au camion**, affichée en panneau pendant le guidage, avec alerte vocale en cas de dépassement :
  | | 3,5–7,5 t | > 7,5 t |
  |---|---|---|
  | Autoroute, 2x2 voies séparées | 90 | 90 |
  | Autres routes, Flandre | 70 (90 si panneau) | 60 |
  | Autres routes, Wallonie | 90 | 60 |
  | Autres routes, Bruxelles | 70 | 60 |
  | Agglomération | 50 (Bruxelles 30) | 50 (Bruxelles 30) |
  Un panneau plus bas l'emporte toujours. Source : [codedelaroute.be, « Limitations de vitesse »](https://www.codedelaroute.be/fr/code-de-la-route/explication-du-code-de-la-route/limitations-de-vitesse).
- **Tunnels bruxellois interdits aux plus de 3,5 t** : l'itinéraire est recalculé pour les éviter (par ex. le tunnel Louise).
- **Prélèvement kilométrique** estimé par région selon le barème [Viapass du 01/07/2026](https://www.viapass.be/fr/tarifs/), la catégorie de poids, la norme Euro et la classe CO₂ (Flandre). Bruxelles : toutes les routes. Flandre et Wallonie : estimation sur autoroutes et grandes routes régionales. Le montant exact est celui de l'OBU. Un nouveau barème est annoncé au 01/01/2027.
- **Zones de basses émissions** Anvers, Gand, Bruxelles (contours OpenStreetMap) : avertissement à la planification et à l'entrée, selon le carburant et la norme Euro (Anvers/Gand : diesel Euro V minimum, Euro IV payant ; Bruxelles : diesel Euro VI).
- Position du camion accrochée à la route et recalcul uniquement sur des positions GPS fiables (précision ≤ 60 m).

## Sur téléphone 📱
L'appli s'installe sur l'écran d'accueil et s'ouvre en plein écran, comme une appli normale.

1. **Mettre l'appli en ligne (une seule fois)** : sur GitHub, dépôt `Roidu777/Rui` → **Settings** → **Pages** → *Build and deployment* → Source **Deploy from a branch** → branche **`claude/sleepy-ride-l5zp1q`**, dossier **`/ (root)`** → **Save**. Après une ou deux minutes, l'appli est à l'adresse :
   **https://roidu777.github.io/Rui/gps-camion/**
2. **Ouvrir cette adresse sur le téléphone**, puis l'installer :
   - iPhone (iOS 26 ou plus récent) : dans **Safari**, bouton **•••** à côté de l'adresse → **Partager** → **Sur l'écran d'accueil** → laisser **Ouvrir comme app web** activé → **Ajouter**. Si « Sur l'écran d'accueil » n'apparaît pas, l'ajouter avec **Modifier les actions** en bas de la liste.
   - Android : dans **Chrome**, bouton **Installer** affiché dans l'appli, ou menu **⋮** → **Installer l'application**.
3. **Autoriser la localisation** quand le téléphone le demande.

Réglages iPhone à vérifier :
- **Position exacte** : Réglages → Confidentialité et sécurité → Service de localisation (activé), puis pour les sites web Safari : « Lorsque l'app est active » et **Position exacte** activée. Sans elle, la position n'est juste qu'à quelques kilomètres près ; l'appli le signale.
- **Mode silencieux coupé** (bouton Action ou Centre de contrôle) : sinon la voix du GPS ne s'entend pas. Le bouton **Tester la voix** (menu Options) permet de vérifier avant de partir.
- Une appli web ne peut pas s'afficher sur l'écran **CarPlay** : utiliser le téléphone sur un support.

Conseils de route :
- Laissez l'appli **au premier plan**. Une appli web ne reçoit plus le GPS quand on change d'appli ou qu'on verrouille l'écran. Pendant le guidage, l'écran reste allumé automatiquement.
- Téléphone **sur un support et branché** : GPS et écran allumé consomment beaucoup de batterie.
- Si le téléphone recharge l'appli (appel, autre appli), elle propose de **reprendre le guidage**.
- **Sans réseau**, l'appli s'ouvre quand même et garde les cartes déjà affichées (environ 3 000 tuiles). Le calcul d'un itinéraire demande du réseau. Si le réseau coupe en route, le guidage continue sur l'itinéraire déjà calculé.

Sur ordinateur, on peut aussi ouvrir `index.html` directement. Mode test sans rouler : ajouter `?demo=1` à l'adresse, puis « Démarrer le guidage » simule le trajet.

## Services utilisés (gratuits, OpenStreetMap)
- Carte : tuiles OpenStreetMap
- Itinéraires : Valhalla (profil `truck`), serveur public FOSSGIS
- Recherche d'adresses : Photon (Komoot), avec Nominatim (OpenStreetMap) en secours

⚠️ Aide à la navigation seulement : les restrictions dépendent des données OpenStreetMap, qui peuvent être incomplètes. La signalisation sur place fait toujours foi.
