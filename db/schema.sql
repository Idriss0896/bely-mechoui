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
