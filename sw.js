// Service worker: tüm dosyalar ağ öncelikli (GitHub Pages max-age'ini aşmak için no-cache), ağ yoksa önbellek.
const SURUM = "ada-vapur-v20";
const KABUK = ["./", "index.html", "app.js", "style.css", "manifest.json", "icon-180.png", "icon-512.png",
  "data/seferler.json", "data/iskeleler.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SURUM)
      .then((c) => c.addAll(KABUK.map((u) => new Request(u, { cache: "no-cache" }))))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
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
  if (new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: "no-cache" }).then((r) => {
      if (r.ok) {
        const kopya = r.clone();
        caches.open(SURUM).then((c) => c.put(req, kopya));
      }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
