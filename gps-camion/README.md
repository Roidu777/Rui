# GPS Camion 🚛

GPS poids lourd dans le navigateur, en un seul fichier (`index.html`), sans compte ni clé d'API.

## Fonctions
- **Itinéraires adaptés au gabarit** : hauteur, largeur, longueur, poids total, charge à l'essieu, matières dangereuses (ADR), vitesse max. Préréglages semi 44 t, porteur 19 t, VUL 3,5 t. Le gabarit est mémorisé.
- **Jusqu'à 3 itinéraires** au choix, avec péages / autoroute / ferry signalés. Options pour éviter péages, autoroutes, ferrys.
- **Pauses réglementaires (UE)** : une pause de 45 min toutes les 4 h 30 de conduite et un repos après 9 h, placés sur la carte, avec la durée totale pauses comprises.
- **Guidage en temps réel** : position GPS, instruction suivante et distance, voix en français, alerte de survitesse, heure d'arrivée, recalcul automatique en cas de sortie d'itinéraire, compte à rebours avant la pause obligatoire, écran maintenu allumé.
- Recherche d'adresse avec suggestions, bouton « Ma position », clic droit (ou appui long) sur la carte pour choisir départ/arrivée.
- Si le départ ou l'arrivée tombe dans une rue interdite aux PL, le point est accroché à la route accessible la plus proche.

## Utilisation
Ouvrir `index.html` dans un navigateur. Pour le GPS sur téléphone, la page doit être servie en **HTTPS** (par exemple via GitHub Pages), sinon le navigateur refuse la géolocalisation.

Mode test sans rouler : ajouter `?demo=1` à l'adresse, puis « Démarrer le guidage » simule le trajet.

## Services utilisés (gratuits, OpenStreetMap)
- Carte : tuiles OpenStreetMap
- Itinéraires : Valhalla (profil `truck`), serveur public FOSSGIS
- Recherche d'adresses : Photon (Komoot)

⚠️ Aide à la navigation seulement : les restrictions dépendent des données OpenStreetMap, qui peuvent être incomplètes. La signalisation sur place fait toujours foi.
