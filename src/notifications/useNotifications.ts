import { useCallback, useEffect, useReducer, useRef, useState } from "react";

export type BelyNotification = {
  id: number;
  title: string;
  body: string;
  created_at: string;
};

export type PushState = "unsupported" | "idle" | "asking" | "granted" | "denied" | "error";

const LAST_SEEN_KEY = "bely-notifications-seen";

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

/* La cloche existe en deux exemplaires (barre haute + en-tête) : la liste et
   l'état de chargement sont partagés par module, sinon chaque exemplaire
   interrogeait l'API dans son coin et l'un restait vide. */
let notifStore: BelyNotification[] = [];
let storeReady = false;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let lastFetchAt = 0;

async function loadNotifications() {
  if (inflight) return inflight;
  if (storeReady && Date.now() - lastFetchAt < 20_000) return;
  lastFetchAt = Date.now();
  inflight = (async () => {
    try {
      const response = await fetch("/api/notifications", { headers: { Accept: "application/json" } });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data?.notifications)) notifStore = data.notifications as BelyNotification[];
      }
    } catch {
      /* hors ligne : on garde la dernière liste connue */
    } finally {
      storeReady = true;
      inflight = null;
      listeners.forEach((listener) => listener());
    }
  })();
  return inflight;
}

/** Petit carillon quand une nouvelle annonce arrive pendant la consultation. */
function playChime() {
  try {
    const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const context = new AudioCtx();
    const now = context.currentTime;
    [880, 1174].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.12;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.26);
    });
    window.setTimeout(() => void context.close().catch(() => undefined), 800);
  } catch {
    /* audio indisponible : la notification visuelle suffit */
  }
}

export function useNotifications() {
  const [, bump] = useReducer((value: number) => value + 1, 0);
  const [lastSeen, setLastSeen] = useState(readLastSeen);
  const [pushState, setPushState] = useState<PushState>(() => (supportsPush() ? "idle" : "unsupported"));
  const [pushMessage, setPushMessage] = useState("");
  const seenRef = useRef(lastSeen);

  seenRef.current = lastSeen;

  const items = notifStore;
  const ready = storeReady;
  const unread = items.filter((item) => item.id > lastSeen).length;

  useEffect(() => {
    const listener = () => bump();
    listeners.add(listener);
    void loadNotifications();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadNotifications();
    }, 60_000);
    const onFocus = () => void loadNotifications();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      listeners.delete(listener);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, []);

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
    if ("clearAppBadge" in navigator) void navigator.clearAppBadge?.();
    navigator.serviceWorker?.controller?.postMessage({ type: "bely-badge-clear" });
  }, [items]);

  // Ouverture depuis une notification poussée : le compteur repart à zéro.
  useEffect(() => {
    const pushed = Number(new URLSearchParams(window.location.search).get("push"));
    if (!Number.isFinite(pushed) || pushed <= 0) return;
    if (pushed > readLastSeen()) {
      window.localStorage.setItem(LAST_SEEN_KEY, String(pushed));
      setLastSeen(pushed);
    }
    const params = new URLSearchParams(window.location.search);
    params.delete("push");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);

  // Un tap sur la notification pendant que l'application est ouverte.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "bely-notification-click") {
        void loadNotifications();
        markAllRead();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [markAllRead]);

  // Carillon à l'arrivée d'une nouvelle annonce, application au premier plan.
  const previousTop = useRef(0);
  useEffect(() => {
    const top = items.length ? items[0].id : 0;
    const isNew = previousTop.current > 0 && top > previousTop.current && top > lastSeen;
    previousTop.current = top;
    if (isNew && document.visibilityState === "visible") playChime();
  }, [items, lastSeen]);

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
