import { neon } from "@neondatabase/serverless";
import { pushConfig } from "./_push.js";

const connectionString = process.env.DATABASE_URL;
const sql = connectionString ? neon(connectionString) : null;

const readBody = (request) =>
  typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body ?? {});

/** Un abonnement Web Push valide contient un endpoint et la paire de clés du navigateur. */
function readSubscription(value) {
  if (!value || typeof value !== "object") return null;
  const endpoint = typeof value.endpoint === "string" ? value.endpoint : "";
  const p256dh = value.keys?.p256dh;
  const auth = value.keys?.auth;
  if (!endpoint.startsWith("https://") || endpoint.length > 900) return null;
  if (typeof p256dh !== "string" || p256dh.length < 20 || p256dh.length > 300) return null;
  if (typeof auth !== "string" || auth.length < 8 || auth.length > 120) return null;
  return { endpoint, p256dh, auth };
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (!sql) {
    return response.status(503).json({ configured: false, error: "DATABASE_URL manquant" });
  }

  try {
    if (request.method === "GET") {
      const config = await pushConfig();
      return response.status(200).json({ configured: Boolean(config), publicKey: config?.publicKey ?? null });
    }

    if (request.method === "POST") {
      const config = await pushConfig();
      if (!config) {
        return response.status(503).json({ configured: false, error: "Clés VAPID manquantes" });
      }
      const body = readBody(request);
      const subscription = readSubscription(body.subscription);
      if (!subscription) {
        return response.status(400).json({ error: "Abonnement invalide" });
      }

      await sql`
        insert into bely_push_subscriptions (endpoint, p256dh, auth, user_agent)
        values (${subscription.endpoint}, ${subscription.p256dh}, ${subscription.auth}, ${request.headers["user-agent"] ?? null})
        on conflict (endpoint) do update
          set p256dh = excluded.p256dh,
              auth = excluded.auth,
              user_agent = excluded.user_agent,
              last_seen_at = now()
      `;

      return response.status(200).json({ ok: true });
    }

    if (request.method === "DELETE") {
      const body = readBody(request);
      const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
      if (!endpoint) return response.status(400).json({ error: "endpoint manquant" });
      await sql`delete from bely_push_subscriptions where endpoint = ${endpoint}`;
      return response.status(200).json({ ok: true });
    }

    response.setHeader("Allow", "GET, POST, DELETE");
    return response.status(405).json({ error: "Méthode non autorisée" });
  } catch (error) {
    console.error("api/push", error);
    return response.status(500).json({ error: "Erreur base de données" });
  }
}
