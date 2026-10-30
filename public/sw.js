const CACHE_NAME = "bely-mechoui-v4";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/logo-bely-mechoui.jpg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigation : réseau d'abord, cache en secours (évite de figer une ancienne version).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Assets : cache immédiat, rafraîchi en arrière-plan.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

/* ------------------------------------------------------------------ */
/* Notifications push : fonctionne même quand l'application est fermée */
/* ------------------------------------------------------------------ */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Bely Mechoui";
  const body = payload.body || "Une nouvelle annonce du restaurant.";
  const url = payload.url || "/#accueil";
  const tag = payload.tag || "bely-notification";

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body,
        tag,
        renotify: true,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        image: payload.image || undefined,
        lang: "fr",
        data: { url, id: payload.id ?? null },
        vibrate: [90, 60, 90],
      });

      if (payload.id && "setAppBadge" in self.navigator) {
        try {
          const all = await self.clients.matchAll({ includeUncontrolled: true });
          const count = Number(payload.count ?? 1);
          if (all.length === 0) await self.navigator.setAppBadge(count);
        } catch {
          /* badge non supporté */
        }
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  const target = event.notification.data?.url || "/#accueil";
  event.notification.close();

  event.waitUntil(
    (async () => {
      try {
        if ("clearAppBadge" in self.navigator) await self.navigator.clearAppBadge();
      } catch {
        /* badge non supporté */
      }

      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus();
          client.postMessage({ type: "bely-notification-click", url: target });
          return;
        }
      }

      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("notificationclose", () => {
  /* Rien à faire : le badge reste tant que la notification n'est pas ouverte. */
});

// Permet à la page de remettre le compteur à zéro une fois les nouvelles lues.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "bely-badge-clear") return;
  event.waitUntil(
    (async () => {
      try {
        if ("clearAppBadge" in self.navigator) await self.navigator.clearAppBadge();
      } catch {
        /* badge non supporté */
      }
    })(),
  );
});
