import { neon } from "@neondatabase/serverless";
import { createHash, timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { adminIsValid } from "./_session.js";

const connectionString = process.env.DATABASE_URL;
const sql = connectionString ? neon(connectionString) : null;

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT ?? "https://bely-mechoui.vercel.app";
const pushReady = Boolean(publicKey && privateKey);
if (pushReady) webpush.setVapidDetails(subject, publicKey, privateKey);

/** Comparaison à temps constant pour ne pas fuiter le mot de passe. */
function passwordMatches(candidate) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected || typeof candidate !== "string" || !candidate) return false;
  const given = createHash("sha256").update(candidate).digest();
  const secret = createHash("sha256").update(expected).digest();
  return timingSafeEqual(given, secret);
}

const readBody = (request) =>
  typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body ?? {});

/** Envoie la notification à tous les appareils abonnés. */
async function broadcast(notification) {
  if (!pushReady) return { configured: false, sent: 0, failed: 0 };
  const rows = await sql`select endpoint, p256dh, auth from bely_push_subscriptions`;
  if (!rows.length) return { configured: true, sent: 0, failed: 0 };

  const payload = JSON.stringify({
    id: notification.id,
    title: notification.title,
    body: notification.body,
    url: "/#accueil",
    tag: `bely-${notification.id}`,
  });

  const stale = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        if (error?.statusCode === 404 || error?.statusCode === 410) stale.push(row.endpoint);
      }
    }),
  );

  if (stale.length) {
    await sql`delete from bely_push_subscriptions where endpoint = any(${stale})`;
  }

  return { configured: true, sent, failed };
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (!sql) {
    return response.status(503).json({ configured: false, error: "DATABASE_URL manquant" });
  }

  try {
    if (request.method === "GET") {
      // Sondage léger : uniquement le dernier identifiant, pour un temps réel à faible coût.
      if (new URL(request.url, "http://localhost").searchParams.get("meta")) {
        const [latest] = await sql`select id from bely_notifications order by id desc limit 1`;
        return response.status(200).json({ latest: latest?.id == null ? null : Number(latest.id) });
      }

      const rows = await sql`
        select id, title, body, created_at
        from bely_notifications
        order by created_at desc
        limit 30
      `;
      return response.status(200).json({ notifications: rows });
    }

    if (request.method === "POST") {
      const body = readBody(request);
      // Session signée de l'administration, ou mot de passe historique.
      const allowed = (await adminIsValid(request)) || passwordMatches(body.password);
      if (!allowed) {
        return response.status(401).json({ error: "Mot de passe incorrect" });
      }

      const title = String(body.title ?? "").trim();
      const message = String(body.body ?? "").trim();
      if (!title || !message) {
        return response.status(400).json({ error: "Titre et message obligatoires" });
      }
      if (title.length > 120 || message.length > 400) {
        return response.status(400).json({ error: "Titre (120) ou message (400) trop long" });
      }

      const [row] = await sql`
        insert into bely_notifications (title, body)
        values (${title}, ${message})
        returning id, title, body, created_at
      `;

      const result = await broadcast(row);
      if (result.sent > 0 || result.configured) {
        await sql`update bely_notifications set push_sent_at = now() where id = ${row.id}`;
      }

      return response.status(201).json({ notification: row, push: result });
    }

    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Méthode non autorisée" });
  } catch (error) {
    console.error("api/notifications", error);
    return response.status(500).json({ error: "Erreur base de données" });
  }
}
