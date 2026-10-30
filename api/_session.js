import { neon } from "@neondatabase/serverless";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Connexion Neon partagée par les fonctions API. */
export const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

const digest = (value) => createHash("sha256").update(String(value)).digest();

export function safeEqual(a, b) {
  return timingSafeEqual(digest(a), digest(b));
}

export function bearerToken(request) {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/** Clé de signature : l'empreinte en base si elle existe, sinon ADMIN_PASSWORD. */
export async function sessionSecret() {
  try {
    const rows = await sql`select password_hash from bely_admin where id = 1`;
    return rows[0]?.password_hash ?? (process.env.ADMIN_PASSWORD || null);
  } catch {
    // Table absente : le mot de passe d'environnement s'applique.
    return process.env.ADMIN_PASSWORD || null;
  }
}

/** Vérifie le jeton d'une session d'administration. */
export async function adminIsValid(request) {
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
