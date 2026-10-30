import { useEffect, useState } from "react";
import { Bell, BellRing, Check, Download, Share, Smartphone, X } from "lucide-react";
import { useInstallPrompt, useNotifications } from "./useNotifications";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ferme les autres panneaux (favoris) quand celui-ci s'ouvre. */
  onBeforeOpen?: () => void;
};

function timeAgo(iso: string) {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "";
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(iso));
}

export default function NotificationCenter({ open, onOpenChange, onBeforeOpen }: Props) {
  const { items, unread, ready, markAllRead, pushState, pushMessage, enablePush } = useNotifications();
  const install = useInstallPrompt();
  const [showIosHint, setShowIosHint] = useState(false);
  const [installMessage, setInstallMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Panneau ouvert : tout ce qui arrive est lu immédiatement, même si la liste
  // est arrivée après l'ouverture ou si une annonce tombe entre-temps.
  useEffect(() => {
    if (open && items.length) markAllRead();
  }, [open, items, markAllRead]);

  const toggle = () => {
    const next = !open;
    if (next) {
      onBeforeOpen?.();
      markAllRead();
    }
    onOpenChange(next);
  };

  const installNow = async () => {
    if (install.canInstall) {
      const accepted = await install.promptInstall();
      setInstallMessage(accepted ? "Installation lancée…" : "");
      return;
    }
    setShowIosHint(true);
  };

  return (
    <div className="notification-wrap">
      <button
        className={`icon-button icon-button--header ${open ? "is-open" : ""}`}
        aria-label={unread ? `Notifications, ${unread} non lues` : "Notifications"}
        aria-expanded={open}
        onClick={toggle}
      >
        <Bell size={18} />
        {unread > 0 && <span className="notification-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notification-panel notification-panel--rich" role="dialog" aria-label="Notifications">
          <div className="notification-panel__head">
            <div>
              <span className="eyebrow eyebrow--light">À la maison</span>
              <strong>Les nouvelles de Bely</strong>
            </div>
            <button className="notif-close" type="button" onClick={() => onOpenChange(false)} aria-label="Fermer les notifications">
              <X size={16} />
            </button>
          </div>

          <div className="notif-list">
            {items.map((notification) => (
              <article className="notif-item" key={notification.id}>
                <span className="notif-item__icon"><BellRing size={14} /></span>
                <span className="notif-item__body">
                  <strong>{notification.title}</strong>
                  <p>{notification.body}</p>
                  <em>{timeAgo(notification.created_at)}</em>
                </span>
              </article>
            ))}
            {items.length === 0 && (
              <p className="panel-empty">{ready ? "Aucune annonce pour le moment. Active les notifications pour être prévenu." : "Chargement des nouvelles…"}</p>
            )}
          </div>

          <div className="notif-tools">
            {pushState === "granted" ? (
              <span className="notif-tool notif-tool--ok"><Check size={14} /> Notifications activées sur cet appareil</span>
            ) : pushState === "denied" ? (
              <span className="notif-tool notif-tool--muted">Notifications bloquées : autorise-les dans le navigateur.</span>
            ) : pushState === "unsupported" ? (
              <span className="notif-tool notif-tool--muted">Ce navigateur ne gère pas les notifications push.</span>
            ) : (
              <button type="button" className="notif-tool notif-tool--action" onClick={enablePush} disabled={pushState === "asking"}>
                <Bell size={14} /> {pushState === "asking" ? "Activation…" : "Activer les notifications"}
              </button>
            )}
            {pushMessage && <small className="notif-hint">{pushMessage}</small>}

            {install.installed ? (
              <span className="notif-tool notif-tool--ok"><Smartphone size={14} /> Application installée</span>
            ) : install.canInstall ? (
              <button type="button" className="notif-tool notif-tool--action" onClick={installNow}>
                <Download size={14} /> Installer l'application
              </button>
            ) : (
              <button type="button" className="notif-tool notif-tool--action" onClick={installNow}>
                {install.isIos ? <Share size={14} /> : <Download size={14} />} Installer sur mon appareil
              </button>
            )}
            {installMessage && <small className="notif-hint">{installMessage}</small>}
            {showIosHint && (
              <small className="notif-hint">
                {install.isIos
                  ? "Sur iPhone/iPad : bouton Partager (carré avec flèche), puis « Sur l'écran d'accueil »."
                  : "Dans le menu du navigateur : « Installer l'application » ou « Ajouter à l'écran d'accueil »."}
              </small>
            )}
          </div>

          {items.length > 0 && (
            <button className="notification-panel__close" onClick={() => onOpenChange(false)}>Refermer</button>
          )}
        </div>
      )}
    </div>
  );
}
