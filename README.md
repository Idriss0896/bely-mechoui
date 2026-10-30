# Bely Mechoui

Application web du restaurant Bely Mechoui : menu digital, PWA et espace
d'administration pour mettre la carte à jour.

## Développement

```bash
npm install
npm run dev
```

Le serveur de dev sert aussi `/api/menu` (voir `tools/dev-api.mjs`), pour que
`/admin` soit utilisable en local sans passer par Vercel.

## Base de données (Neon)

1. Copier `.env.example` vers `.env`, puis renseigner `DATABASE_URL`
   (connexion « Pooled » de Neon, avec `sslmode=require`) et `ADMIN_PASSWORD`.
2. Créer la table :

   ```bash
   node --env-file=.env db/setup.mjs
   ```

3. Sur Vercel : Project Settings → Environment Variables, ajouter
   `DATABASE_URL` et `ADMIN_PASSWORD`, puis redéployer.

Sans ces variables, le site reste consultable avec le menu embarqué
(`src/data/menu.ts`), mais l'administration ne peut rien enregistrer.

## Administration

- Local : http://127.0.0.1:5173/admin
- Production : https://bely-mechoui.vercel.app/admin

Le premier enregistrement crée la ligne unique de la table `bely_menu` ;
ensuite le site lit la carte depuis la base.

## Notifications

Depuis `/admin` → **Notifications**, un titre et un message partent vers la
cloche du site et, si les clés VAPID sont configurées, en push sur les
appareils abonnés (téléphone qui sonne même application fermée).

Mise en place :

1. Générer une paire de clés :

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Renseigner `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` dans
   `.env`, puis ajouter les **trois mêmes variables** dans Vercel, et
   redéployer.
3. Les tables `bely_notifications` et `bely_push_subscriptions` sont créées par
   `node --env-file=.env db/setup.mjs`.
4. Chaque visiteur active les notifications depuis la cloche ; l'abonnement est
   enregistré en base et supprimé automatiquement s'il expire.

Limites connues : sur iPhone/iPad, le push n'est disponible qu'à partir d'iOS
16.4 et **après installation de l'application sur l'écran d'accueil** ; le
badge rouge sur l'icône n'existe que sur Android et les navigateurs Chromium.

