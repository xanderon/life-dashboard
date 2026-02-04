const CACHE_NAME = "life-dashboard-v1";
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icon.svg",
  "/icon-180.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key === CACHE_NAME ? null : caches.delete(key))))
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {};
    }
  }
  const title = data.title || "Life Dashboard";
  const options = {
    body: data.body || "",
    icon: "/icon-180.png",
    badge: "/icon-180.png",
    tag: data.tag || "life-dashboard",
    data: {
      url: data.url || "/",
      payload: data.data || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification?.data?.url || "/";
  const targetUrl = new URL(rawUrl, self.location.origin).toString();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl || client.url.startsWith(targetUrl)) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
