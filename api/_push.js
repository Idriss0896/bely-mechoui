import webpush from "web-push";
import { sql } from "./_session.js";

const DEFAULT_SUBJECT = "https://bely-mechoui.vercel.app";

/**
 * Clés VAPID : variables d'environnement en priorité, sinon la table
 * `bely_config` de Neon. Cela permet aux notifications de fonctionner même
 * si les variables Vercel n'ont pas encore été saisies dans le tableau de bord.
 */
let cached;

async function fromEnvironment() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || DEFAULT_SUBJECT };
}

async function fromDatabase() {
  if (!sql) return null;
  try {
    const rows = await sql`select key, value from bely_config where key in ('vapid_public', 'vapid_private', 'vapid_subject')`;
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    if (!values.vapid_public || !values.vapid_private) return null;
    return {
      publicKey: values.vapid_public,
      privateKey: values.vapid_private,
      subject: values.vapid_subject || DEFAULT_SUBJECT,
    };
  } catch {
    // Table absente : les variables d'environnement restent la seule source.
    return null;
  }
}

export async function pushConfig() {
  if (cached !== undefined) return cached;
  cached = (await fromEnvironment()) ?? (await fromDatabase());
  if (cached) webpush.setVapidDetails(cached.subject, cached.publicKey, cached.privateKey);
  return cached;
}
