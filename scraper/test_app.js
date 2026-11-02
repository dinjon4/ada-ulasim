// Node testi: node scraper/test_app.js  (hizmet gunu ve liste mantigi)
const a = require("../app.js"), v = require("../data/seferler.json");
const S = ["Maltepe", "Bostancı", "Kartal", "Kadıköy", "Kabataş", "Heybeliada"];
const assert = require("assert");
function calis(t, yon) {
  const simdi = a.hizmetGunu(a.saatiCoz(t));
  const r = a.listeHesapla(v, yon, S, simdi);
  return { simdi, r, tip: a.gunTipi(simdi.tarih, v.tatiller) };
}
const gece = (r) => r.bugun.filter((s) => s.kalkis >= "24:00");
// a) Cumartesi 23:50: gece seferleri bugunun listesinde ve siradaki
{
  const { simdi, r, tip } = calis("2026-11-07T23:50", "adadan");
  const sira = r.bugun[r.siradaki];
  console.log("a)", simdi.tarih, tip, "gece sefer:", gece(r).length, "siradaki:", a.saatGoster(sira.kalkis), sira.kalkis, "bitti:", r.bugunBitti);
  assert(simdi.tarih === "2026-11-07" && gece(r).length > 0 && sira.kalkis >= "24:00" && !r.bugunBitti);
}
// b) Pazar 00:40 -> hizmet gunu Cumartesi
{
  const { simdi, r, tip } = calis("2026-11-08T00:40", "adadan");
  const sira = r.bugun[r.siradaki];
  console.log("b)", simdi.tarih, tip, "dk", simdi.dk, "gece:", gece(r).map((s) => s.kalkis + " " + s.gunler.join("/")).join(", "), "| siradaki", sira ? sira.kalkis : "yok (hepsi kalkti)");
  assert(simdi.tarih === "2026-11-07" && tip === "cumartesi" && gece(r).length > 0);
  assert(r.bugun.every((s) => s.gunler.includes("cumartesi")));
  // pazar'a ozel gece seferi (cumartesi icermeyen) listede olmamali
  assert(!r.bugun.some((s) => !s.gunler.includes("cumartesi")));
}
// c) Pazartesi 00:40 -> hizmet gunu Pazar
{
  const { simdi, r, tip } = calis("2026-11-09T00:40", "adadan");
  const ks = gece(r).map((s) => s.kalkis + " " + s.gunler.join("/"));
  console.log("c)", simdi.tarih, tip, "gece:", ks.join(", "));
  assert(simdi.tarih === "2026-11-08" && tip === "pazar" && gece(r).length > 0);
  assert(r.bugun.every((s) => s.gunler.includes("pazar")));
  const anahtar = r.bugun.map((s) => [s.firma, s.kalkis_iskele, s.varis_iskele, s.kalkis].join("|"));
  assert.strictEqual(new Set(anahtar).size, anahtar.length, "tekrar sefer var");
}
// d) onceki testler
{
  const x = calis("2026-11-08T21:30", "adadan");
  console.log("d1) Pazar 21:30", x.tip, "siradaki", x.r.bugun[x.r.siradaki].kalkis, "bitti", x.r.bugunBitti,
    "yildizli Prenstur 06:20 var mi:", x.r.bugun.some((s) => s.firma === "Prenstur" && s.kalkis === "06:20"));
  assert(x.tip === "pazar" && !x.r.bugunBitti && !x.r.bugun.some((s) => s.firma === "Prenstur" && s.kalkis === "06:20"));
  const y = calis("2026-11-09T14:07", "adaya");
  const sira = y.r.bugun[y.r.siradaki];
  const gec = y.r.bugun.filter((s) => s.kalkis === "14:00");
  console.log("d2) Pzt 14:07", y.tip, "siradaki", sira.kalkis, sira.kalkis_iskele, a.kalanMetni(sira.kalkis, y.simdi.dk));
  assert(y.tip === "hafta_ici" && sira.kalkis >= "14:07" && y.r.bugun[y.r.siradaki - 1].kalkis < "14:07");
}
// e) gun sonu -> yarin (hizmet gunu): Pazar 02:59 hala Cumartesi, Pazar 03:00 Pazar
{
  const s1 = a.hizmetGunu(a.saatiCoz("2026-11-08T02:59")), s2 = a.hizmetGunu(a.saatiCoz("2026-11-08T03:00"));
  console.log("e)", s1.tarih, s1.dk, s2.tarih, s2.dk);
  assert(s1.tarih === "2026-11-07" && s1.dk === 179 + 1440 && s2.tarih === "2026-11-08");
  const f = calis("2026-11-08T02:59", "adadan");
  console.log("   02:59 bitti:", f.r.bugunBitti, "yarin ilk:", f.r.yarin.slice(0, 2).map((s) => a.saatGoster(s.kalkis)));
}
console.log("TUM TESTLER GECTI");
