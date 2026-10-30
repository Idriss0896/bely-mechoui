-- Table unique qui stocke la carte du restaurant.
--
-- À exécuter une fois dans la console SQL de Neon :
--   psql "$DATABASE_URL" -f db/schema.sql
-- ou coller ce contenu dans l'éditeur SQL du tableau de bord Neon.

create table if not exists bely_menu (
  id integer primary key,
  menu jsonb not null,
  categories jsonb not null,
  hours jsonb not null,
  updated_at timestamptz not null default now(),
  constraint bely_menu_single_row check (id = 1)
);

-- La ligne 1 est créée automatiquement au premier enregistrement depuis /#admin.

-- Notifications envoyées depuis l'administration.
-- `push_sent_at` évite de renvoyer deux fois une notification après un échec partiel.
create table if not exists bely_notifications (
  id bigserial primary key,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  push_sent_at timestamptz
);

create index if not exists bely_notifications_created_idx
  on bely_notifications (created_at desc);

-- Abonnements Web Push (un par appareil / navigateur).
create table if not exists bely_push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
