# Élec Chantier

Application Android (PWA) pour chiffrer le volume d'appareillage électrique à partir de photos de chantier.

## Utilisation
1. **+ Chantier** : créer un dossier par chantier.
2. Dans le chantier : **📷 Photo** (appareil photo) ou **🖼 Importer** (galerie, plusieurs photos possibles).
3. Toucher une photo : choisir un appareillage dans la barre du haut (prise, interrupteur, point lumineux, spot, RJ45…), puis **toucher la photo** pour le poser. Glisser un repère pour le déplacer, **Retirer** pour le supprimer, **Annuler** pour revenir en arrière.
4. **📊 Excel** : génère `NomDuChantier - appareillage.xlsx` avec 2 feuilles :
   - *Récapitulatif* : quantité totale par type d'appareillage
   - *Par pièce* : quantités par photo/pièce, avec totaux (formules SUM)
5. Menu ⋮ de l'accueil : ajouter vos propres types d'appareillage.

Tout est stocké sur le téléphone (aucun envoi sur Internet), et l'appli fonctionne hors ligne.

## Installer sur le téléphone
Les fichiers doivent être servis en HTTPS (Chrome l'exige pour installer une PWA et utiliser l'appareil photo).
Hébergement gratuit le plus simple : déposer le dossier sur **Netlify Drop** (app.netlify.com/drop), **GitHub Pages** ou **Cloudflare Pages**.
Puis, sur Android, ouvrir l'adresse dans Chrome → menu ⋮ → **Installer l'application**.

## Obtenir un vrai fichier .apk
1. Héberger l'appli (ci-dessus) pour avoir une adresse HTTPS.
2. Aller sur **pwabuilder.com**, coller l'adresse, choisir **Package for stores → Android**.
3. Télécharger le paquet : il contient l'APK (et l'AAB) prêts à installer.
