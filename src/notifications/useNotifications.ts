import { useCallback, useEffect, useRef, useState } from "react";

export type BelyNotification = {
  id: number;
  title: string;
  body: string;
  created_at: string;
};

export type PushState = "unsupported" | "idle" | "asking" | "granted" | "denied" | "error";

const LAST_SEEN_KEY = "bely-notifications-seen";

/** Deux exemplaires de la cloche existent (barre haute + en-tête) : on partage le dernier appel. */
let lastFetchAt = 0;
let inflight: Promise<void> | null = null;

const readLastSeen = () => {
  if (typeof window === "undefined") return 0;
  const value = Number(window.localStorage.getItem(LAST_SEEN_KEY) ?? "0");
  return Number.isFinite(value) ? value : 0;
};

/** Clé VAPID base64url → Uint8Array, format attendu par pushManager. */
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

const supportsPush = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export function useNotifications() {
  const [items, setItems] = useState<BelyNotification[]>([]);
  const [lastSeen, setLastSeen] = useState(readLastSeen);
  const [pushState, setPushState] = useState<PushState>(() => (supportsPush() ? "idle" : "unsupported"));
  const [pushMessage, setPushMessage] = useState("");
  const [ready, setReady] = useState(false);
  const seenRef = useRef(lastSeen);

  seenRef.current = lastSeen;

  const unread = items.filter((item) => item.id > lastSeen).length;

  const refresh = useCallback(async () => {
    if (inflight) return inflight;
    if (Date.now() - lastFetchAt < 15_000) return;
    lastFetchAt = Date.now();
    inflight = (async () => {
      try {
        const response = await fetch("/api/notifications", { headers: { Accept: "application/json" } });
        if (!response.ok) return;
        const data = await response.json();
        if (Array.isArray(data?.notifications)) setItems(data.notifications as BelyNotification[]);
        setReady(true);
      } catch {
        /* hors ligne : on garde la dernière liste connue */
        setReady(true);
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [refresh]);

  // Badge sur l'icône de l'application (Chrome / Edge / Android).
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    if (unread > 0) void navigator.setAppBadge(unread);
    else void navigator.clearAppBadge?.();
  }, [unread]);

  const markAllRead = useCallback(() => {
    const latest = items.length ? items[0].id : 0;
    if (!latest) return;
    window.localStorage.setItem(LAST_SEEN_KEY, String(latest));
    setLastSeen(latest);
    navigator.serviceWorker?.controller?.postMessage({ type: "bely-badge-clear" });
  }, [items]);

  // Abonnement existant ?
  useEffect(() => {
    if (!supportsPush()) return;
    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (subscription) setPushState("granted");
      })
      .catch(() => undefined);
  }, []);

  const enablePush = useCallback(async () => {
    if (!supportsPush()) {
      setPushState("unsupported");
      return;
    }
    setPushState("asking");
    setPushMessage("");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState("denied");
        setPushMessage("Notifications refusées dans le navigateur : autorise-les dans les réglages du site.");
        return;
      }

      const response = await fetch("/api/push", { headers: { Accept: "application/json" } });
      const data = await response.json().catch(() => ({}));
      const publicKey = data?.publicKey as string | undefined;
      if (!publicKey) {
        setPushState("error");
        setPushMessage("Le serveur n'a pas encore ses clés de notification (VAPID).");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const saved = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      if (!saved.ok) {
        setPushState("error");
        setPushMessage("Impossible d'enregistrer cet appareil.");
        return;
      }

      setPushState("granted");
      setPushMessage("Cet appareil recevra les notifications, même application fermée.");
    } catch {
      setPushState("error");
      setPushMessage("Impossible d'activer les notifications sur ce navigateur.");
    }
  }, []);

  return { items, unread, ready, markAllRead, pushState, pushMessage, enablePush };
}

/** Invite d'installation PWA (Chrome/Edge/Android) + détection iOS. */
export function useInstallPrompt() {
  const [event, setEvent] = useState<any>(null);
  const [installed, setInstalled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as any).standalone);
  });

  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(userAgent) || (userAgent.includes("Macintosh") && "ontouchend" in document);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(userAgent);

  useEffect(() => {
    const handler = (promptEvent: Event) => {
      promptEvent.preventDefault();
      setEvent(promptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!event) return false;
    event.prompt();
    const choice = await event.userChoice.catch(() => null);
    setEvent(null);
    return choice?.outcome === "accepted";
  }, [event]);

  return { canInstall: Boolean(event), installed, isIos, isSafari, promptInstall };
}
