import { neon } from "@neondatabase/serverless";
import { createHash, timingSafeEqual } from "node:crypto";

const connectionString = process.env.DATABASE_URL;
const sql = connectionString ? neon(connectionString) : null;

/** Comparaison à temps constant pour ne pas fuiter le mot de passe. */
function passwordMatches(candidate) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected || typeof candidate !== "string" || !candidate) return false;
  const given = createHash("sha256").update(candidate).digest();
  const secret = createHash("sha256").update(expected).digest();
  return timingSafeEqual(given, secret);
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (!sql) {
    return response.status(503).json({ configured: false, error: "DATABASE_URL manquant" });
  }

  try {
    if (request.method === "GET") {
      const rows = await sql`select menu, categories, hours, updated_at from bely_menu where id = 1`;
      if (!rows.length) {
        return response.status(200).json({ configured: true, seed: true });
      }
      return response.status(200).json({ configured: true, ...rows[0] });
    }

    if (request.method === "POST" || request.method === "PUT") {
      const body = typeof request.body === "string" ? JSON.parse(request.body) : (request.body ?? {});

      if (!passwordMatches(body.password)) {
        return response.status(401).json({ error: "Mot de passe incorrect" });
      }

      // POST sert uniquement à vérifier le mot de passe (connexion).
      if (request.method === "POST") {
        return response.status(200).json({ ok: true });
      }

      const { menu, categories, hours } = body;
      if (!menu || typeof menu !== "object" || !Array.isArray(categories)) {
        return response.status(400).json({ error: "Données invalides" });
      }

      await sql`
        insert into bely_menu (id, menu, categories, hours, updated_at)
        values (1, ${JSON.stringify(menu)}::jsonb, ${JSON.stringify(categories)}::jsonb, ${JSON.stringify(hours)}::jsonb, now())
        on conflict (id) do update
          set menu = excluded.menu,
              categories = excluded.categories,
              hours = excluded.hours,
              updated_at = now()
      `;

      return response.status(200).json({ ok: true });
    }

    response.setHeader("Allow", "GET, POST, PUT");
    return response.status(405).json({ error: "Méthode non autorisée" });
  } catch (error) {
    console.error("api/menu", error);
    return response.status(500).json({ error: "Erreur base de données" });
  }
}
