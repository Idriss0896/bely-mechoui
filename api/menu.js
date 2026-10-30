import { neon } from "@neondatabase/serverless";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const connectionString = process.env.DATABASE_URL;
const sql = connectionString ? neon(connectionString) : null;

/** Durée d'une session d'administration. */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
/** Longueur minimale acceptée pour un nouveau mot de passe. */
const MIN_PASSWORD_LENGTH = 6;

/** Comparaison à temps constant, sur des empreintes de taille fixe. */
function digest(value) {
  return createHash("sha256").update(String(value)).digest();
}

function safeEqual(a, b) {
  return timingSafeEqual(digest(a), digest(b));
}

/** Empreinte scrypt salée, au format `scrypt:salt:hash` (base64). */
function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

function verifyPassword(password, stored) {
  if (typeof password !== "string" || !password) return false;
  const [scheme, salt, hash] = String(stored).split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Table des identifiants d'administration, créée au premier usage. */
let schemaReady = null;
function ensureSchema() {
  schemaReady ??= sql`
    create table if not exists bely_admin (
      id integer primary key check (id = 1),
      password_hash text not null,
      updated_at timestamptz not null default now()
    )
  `.catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

/** Mot de passe enregistré en base, ou `null` tant qu'il n'a jamais été changé. */
async function storedPassword() {
  try {
    const rows = await sql`select password_hash from bely_admin where id = 1`;
    return rows[0]?.password_hash ?? null;
  } catch {
    // Table absente (base jamais migrée) : le mot de passe d'environnement s'applique.
    return null;
  }
}

/**
 * Clé de signature des sessions : l'empreinte en base si elle existe,
 * sinon ADMIN_PASSWORD. Changer le mot de passe invalide donc les anciennes sessions.
 */
async function sessionSecret() {
  return (await storedPassword()) ?? process.env.ADMIN_PASSWORD ?? "";
}

function issueToken(secret) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const signature = createHmac("sha256", secret).update(String(expiresAt)).digest("base64url");
  return { token: `${expiresAt}.${signature}`, expiresAt };
}

function bearerToken(request) {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function sessionIsValid(request) {
  const token = bearerToken(request);
  if (!token) return false;
  const [rawExpiry, signature] = token.split(".");
  const expiresAt = Number(rawExpiry);
  if (!signature || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const secret = await sessionSecret();
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawExpiry).digest("base64url");
  return safeEqual(signature, expected);
}

/** La carte doit rester un objet de tableaux de plats nommés. */
function menuIsValid(menu) {
  if (!menu || typeof menu !== "object" || Array.isArray(menu)) return false;
  return Object.values(menu).every(
    (dishes) =>
      Array.isArray(dishes) &&
      dishes.every((dish) => dish && typeof dish === "object" && typeof dish.name === "string" && dish.name.trim() !== ""),
  );
}

function normalizedStamp(updatedAt) {
  return updatedAt ? String(updatedAt) : "empty";
}

function readBody(request) {
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      return {};
    }
  }
  return request.body ?? {};
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (!sql) {
    return response.status(503).json({ configured: false, error: "DATABASE_URL manquant" });
  }

  try {
    if (request.method === "GET") {
      const wantsMeta = new URL(request.url, "http://localhost").searchParams.has("meta");

      if (wantsMeta) {
        const rows = await sql`select updated_at from bely_menu where id = 1`;
        return response.status(200).json({ configured: true, updatedAt: normalizedStamp(rows[0]?.updated_at) });
      }

      const rows = await sql`select menu, categories, hours, updated_at from bely_menu where id = 1`;
      if (!rows.length) {
        return response.status(200).json({ configured: true, seed: true, updatedAt: normalizedStamp(null) });
      }
      return response.status(200).json({
        configured: true,
        menu: rows[0].menu,
        categories: rows[0].categories,
        hours: rows[0].hours,
        updatedAt: normalizedStamp(rows[0].updated_at),
      });
    }

    if (request.method === "POST") {
      const action = new URL(request.url, "http://localhost").searchParams.get("action");
      const body = readBody(request);

      if (action === "password") {
        if (!(await sessionIsValid(request))) {
          return response.status(401).json({ error: "Session expirée, reconnecte-toi" });
        }
        const next = body.newPassword;
        if (typeof next !== "string" || next.length < MIN_PASSWORD_LENGTH) {
          return response.status(400).json({ error: `Au moins ${MIN_PASSWORD_LENGTH} caractères` });
        }

        const hash = hashPassword(next);
        await ensureSchema();
        await sql`
          insert into bely_admin (id, password_hash, updated_at)
          values (1, ${hash}, now())
          on conflict (id) do update
            set password_hash = excluded.password_hash,
                updated_at = now()
        `;
        return response.status(200).json({ ok: true, ...issueToken(hash) });
      }

      const stored = await storedPassword();
      const accepted = stored ? verifyPassword(body.password, stored) : process.env.ADMIN_PASSWORD && safeEqual(body.password ?? "", process.env.ADMIN_PASSWORD);
      if (!accepted) {
        return response.status(401).json({ error: "Mot de passe incorrect" });
      }
      return response.status(200).json({ ok: true, ...issueToken(stored ?? process.env.ADMIN_PASSWORD ?? "") });
    }

    if (request.method === "PUT") {
      if (!(await sessionIsValid(request))) {
        return response.status(401).json({ error: "Session expirée, reconnecte-toi" });
      }

      const body = readBody(request);
      const { menu, categories, hours } = body;

      if (!menuIsValid(menu) || !Array.isArray(categories) || categories.some((category) => typeof category !== "string")) {
        return response.status(400).json({ error: "Données invalides" });
      }

      const rows = await sql`
        insert into bely_menu (id, menu, categories, hours, updated_at)
        values (
          1,
          ${JSON.stringify(menu)}::jsonb,
          ${JSON.stringify(categories)}::jsonb,
          ${JSON.stringify(hours ?? {})}::jsonb,
          now()
        )
        on conflict (id) do update
          set menu = excluded.menu,
              categories = excluded.categories,
              hours = excluded.hours,
              updated_at = now()
        returning updated_at
      `;

      return response.status(200).json({ ok: true, updatedAt: normalizedStamp(rows[0]?.updated_at) });
    }

    response.setHeader("Allow", "GET, POST, PUT");
    return response.status(405).json({ error: "Méthode non autorisée" });
  } catch (error) {
    console.error("api/menu", error);
    return response.status(500).json({ error: "Erreur base de données" });
  }
}
