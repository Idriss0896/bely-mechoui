import { useCallback, useEffect, useState } from "react";
import { Bell, Send } from "lucide-react";

type SentNotification = {
  id: number;
  title: string;
  body: string;
  created_at: string;
};

type Props = {
  token: string;
  onResult?: (message: string, ok: boolean) => void;
};

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default function AdminNotifications({ token, onResult }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [items, setItems] = useState<SentNotification[]>([]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (Array.isArray(data?.notifications)) setItems(data.notifications as SentNotification[]);
    } catch {
      /* réseau indisponible */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    if (!title.trim() || !body.trim() || sending) return;
    setSending(true);
    setError("");
    setFeedback("");

    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data?.error ?? "Envoi impossible";
        setError(message);
        onResult?.(message, false);
        return;
      }

      const push = data?.push ?? {};
      const parts = ["Notification publiée"];
      if (push.configured === false) parts.push("push non configuré (clés VAPID absentes)");
      else parts.push(`${push.sent ?? 0} appareil(s) prévenu(s)`);
      const message = parts.join(" · ");
      setFeedback(message);
      onResult?.(message, true);
      setTitle("");
      setBody("");
      await load();
    } catch {
      setError("Réseau indisponible");
      onResult?.("Réseau indisponible : notification non envoyée", false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-panel" id="notifications-admin">
      <div className="admin-panel__head">
        <div>
          <span className="admin-eyebrow">Communication</span>
          <h2>Notifications</h2>
        </div>
        <Bell size={20} />
      </div>

      <p className="admin-helper">
        Le message apparaît dans la cloche du site et part en push sur les appareils abonnés —
        même application fermée.
      </p>

      <div className="admin-notif-form">
        <label>
          Titre
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Ex. Méchoui du jour" />
        </label>
        <label>
          Message
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={400} rows={3} placeholder="Ex. Le méchoui sort du four à 12h, réserve ta part." />
        </label>
        <button className="admin-primary" type="button" onClick={send} disabled={sending || !title.trim() || !body.trim()}>
          <Send size={16} /> {sending ? "Envoi…" : "Envoyer la notification"}
        </button>
        {feedback && <p className="admin-feedback is-ok">{feedback}</p>}
        {error && <p className="admin-feedback is-error">{error}</p>}
      </div>

      <div className="admin-notif-list">
        <span className="admin-eyebrow">Dernières notifications</span>
        {items.length === 0 ? (
          <p className="admin-helper">Aucune notification envoyée pour l'instant.</p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="admin-notif-row">
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
              <time dateTime={item.created_at}>{dateLabel(item.created_at)}</time>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
