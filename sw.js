// Basit service worker: uygulama kabugu onbellekte, veri dosyalari once ag (cevrimdisiyken onbellek)
const SURUM = "ada-vapur-v7";
const KABUK = ["./", "index.html", "app.js", "style.css", "manifest.json", "icon-180.png", "icon-512.png"];
const VERI = ["data/seferler.json", "data/iskeleler.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SURUM).then((c) => c.addAll(KABUK)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a !== SURUM).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const veri = VERI.some((v) => url.pathname.endsWith(v));
  if (veri) {
    // ag oncelikli, basarisizsa onbellek
    e.respondWith(
      fetch(req).then((r) => {
        const kopya = r.clone();
        caches.open(SURUM).then((c) => c.put(req, kopya));
        return r;
      }).catch(() => caches.match(req))
    );
  } else {
    // kabuk: onbellek oncelikli, arka planda yenile
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => {
        const ag = fetch(req).then((r) => {
          const kopya = r.clone();
          caches.open(SURUM).then((c) => c.put(req, kopya));
          return r;
        }).catch(() => hit);
        return hit || ag;
      })
    );
  }
});
