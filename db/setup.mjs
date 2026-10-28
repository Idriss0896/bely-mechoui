// Crée la table bely_menu dans la base Neon.
//
// Usage :
//   node --env-file=.env db/setup.mjs
//
// Le fichier .env doit contenir DATABASE_URL (chaîne pooled Neon, avec sslmode=require).

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL manquant. Ajoute-le dans .env (voir .env.example).");
  process.exit(1);
}

if (!connectionString.includes("-pooler")) {
  console.warn("Attention : l'URL ne contient pas '-pooler'. Utilise la chaîne 'Pooled connection' de Neon.");
}

const sql = neon(connectionString);

const schemaFile = new URL("./schema.sql", import.meta.url);
const statements = readFileSync(schemaFile, "utf8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
}

const rows = await sql`select id, updated_at from bely_menu where id = 1`;

console.log("Table bely_menu prête.");
console.log(rows.length ? `Ligne existante : ${JSON.stringify(rows[0])}` : "Table vide : la ligne 1 sera créée au premier enregistrement depuis /#admin.");
