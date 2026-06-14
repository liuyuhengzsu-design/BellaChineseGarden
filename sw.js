const CACHE_NAME = "bella-chinese-garden-v10";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/main.css",
  "./scripts/content.js",
  "./scripts/progress.js",
  "./scripts/app.js",
  "./assets/backgrounds/spring-courtyard.png",
  "./assets/backgrounds/study-room.png",
  "./assets/backgrounds/moon-courtyard.png",
  "./assets/backgrounds/lotus-pond.png",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/decor/bamboo-shadow.png",
  "./assets/decor/bamboo-slip.png",
  "./assets/decor/book-stack.png",
  "./assets/decor/book.png",
  "./assets/decor/bridge.png",
  "./assets/decor/brush-pot.png",
  "./assets/decor/boy-moon.png",
  "./assets/decor/boy-scroll.png",
  "./assets/decor/boy-water.png",
  "./assets/decor/butterfly.png",
  "./assets/decor/cloud-step.png",
  "./assets/decor/cloud.png",
  "./assets/decor/dragonfly.png",
  "./assets/decor/firefly.png",
  "./assets/decor/fish-bubble.png",
  "./assets/decor/flower.png",
  "./assets/decor/gate-charm.png",
  "./assets/decor/girl-brush.png",
  "./assets/decor/girl-butterfly.png",
  "./assets/decor/girl-lotus.png",
  "./assets/decor/inkstone.png",
  "./assets/decor/jade-rabbit-lamp.png",
  "./assets/decor/kite.png",
  "./assets/decor/lantern.png",
  "./assets/decor/lily-pad.png",
  "./assets/decor/lotus.png",
  "./assets/decor/moon.png",
  "./assets/decor/pebble-path.png",
  "./assets/decor/pinwheel.png",
  "./assets/decor/pond-lamp.png",
  "./assets/decor/potted-plum.png",
  "./assets/decor/reed.png",
  "./assets/decor/scroll.png",
  "./assets/decor/seal-cube.png",
  "./assets/decor/star.png",
  "./assets/decor/study-lamp.png",
  "./assets/decor/swing.png",
  "./assets/decor/tea-table.png",
  "./assets/decor/tree.png",
  "./assets/decor/water-ripple.png",
  "./assets/decor/window-curtain.png",
  "./assets/characters/fairy.png",
  "./assets/characters/schoolboy.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
