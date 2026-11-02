// Node testi: node scraper/test_app.js  (birlesik takvim gunu modeli)
const a = require("../app.js"), v = require("../data/seferler.json");
const assert = require("assert");
const S = ["Maltepe", "Bostancı", "Kartal", "Kadıköy", "Kabataş", "Heybeliada"];
function calis(t, yon, secili = S) {
  const simdi = a.saatiCoz(t);
  return { simdi, r: a.listeHesapla(v, yon, secili, simdi), tip: a.gunTipi(simdi.tarih, v.tatiller) };
}
const sira = (x) => x.r.bugun[x.r.siradaki];
const ad = (s) => `${a.saatGoster(s.kalkis)}${s.gece || s.kalkis >= "24" ? "(gece)" : ""} ${s.kalkis_iskele}->${s.varis_iskele}`;

// a) Pzt 01:50, adaya: Bostancı->Büyükada 02:00 siradaki
{
  const x = calis("2026-11-09T01:50", "adaya");
  console.log("a)", x.tip, "siradaki:", ad(sira(x)), a.kalanMetni(sira(x).kalkis, x.simdi.dk));
  assert(sira(x).kalkis === "02:00" && sira(x).kalkis_iskele === "Bostancı" && sira(x).varis_iskele === "Büyükada");
}
// b) Pzt 02:30: Heybeliada->Büyükada 02:55 gorunur (ve siradaki)
{
  const x = calis("2026-11-09T02:30", "adaya");
  const var_ = x.r.bugun.some((s) => s.kalkis === "02:55" && s.kalkis_iskele === "Heybeliada" && s.varis_iskele === "Büyükada");
  console.log("b) 02:55 Heybeliada->Büyükada gorunur:", var_, "| siradaki:", ad(sira(x)));
  assert(var_ && sira(x).kalkis === "02:55");
}
// c) Pzt 00:40: dunun (Pazar) 24:35 seferi 00:35 olarak kalkti, tekrar yok
{
  const x = calis("2026-11-09T00:40", "adadan");
  const g = x.r.bugun.filter((s) => s.kalkis === "00:35");
  const anahtar = x.r.bugun.map((s) => [s.firma, s.kalkis_iskele, s.varis_iskele, s.kalkis].join("|"));
  console.log("c)", "bugun tipi", x.tip, "dun tipi", a.gunTipi("2026-11-08", v.tatiller), "00:35 seferleri:", g.map(ad), "gece bayragi:", g.every((s) => s.gece),
    "kalan:", g.map((s) => a.kalanMetni(s.kalkis, x.simdi.dk)), "tekrar yok:", new Set(anahtar).size === anahtar.length);
  assert(g.length > 0 && g.every((s) => s.gece) && new Set(anahtar).size === anahtar.length);
  assert(g.every((s) => a.kalanMetni(s.kalkis, x.simdi.dk) === "kalktı"));
  // bugunun kendi 24:35 seferleri listenin sonunda "gece" olarak ayrica durur (ayri sefer: 24:35 = ertesi gun 00:35)
  assert(x.r.bugun.some((s) => s.kalkis === "24:35"));
}
// d) Cmt 23:50: bugunun 24:35 seferi siradaki
{
  const x = calis("2026-11-07T23:50", "adadan");
  console.log("d) siradaki:", ad(sira(x)), "ham:", sira(x).kalkis, "bitti:", x.r.bugunBitti);
  assert(sira(x).kalkis === "24:35" && !x.r.bugunBitti);
}
// e) onceki testler
{
  const x = calis("2026-11-08T21:30", "adadan");
  console.log("e1) Pazar 21:30", x.tip, "siradaki", ad(sira(x)), "| Prenstur 06:20 var mi:", x.r.bugun.some((s) => s.firma === "Prenstur" && s.kalkis === "06:20"));
  assert(x.tip === "pazar" && sira(x).kalkis === "21:35" && !x.r.bugun.some((s) => s.firma === "Prenstur" && s.kalkis === "06:20"));
  const y = calis("2026-11-09T14:07", "adaya");
  console.log("e2) Pzt 14:07", y.tip, "siradaki", ad(sira(y)), a.kalanMetni(sira(y).kalkis, y.simdi.dk));
  assert(y.tip === "hafta_ici" && sira(y).kalkis === "14:10" && y.r.bugun[y.r.siradaki - 1].kalkis < "14:07");
}
// f) gun sonu: yarin yalniz <24:00 seferler
{
  const x = calis("2026-11-08T23:59", "adaya", ["Kartal"]);
  console.log("f) Kartal Pazar 23:59 bitti:", x.r.bugunBitti, "yarin ilk:", x.r.yarin.slice(0, 3).map(ad));
  assert(x.r.bugunBitti && x.r.yarin.every((s) => s.kalkis < "24:00"));
}
// g) guncellik durumu: 403'ler uyari cikarmaz, 14 gunden eskiyse cikar
{
  const k = (sb, d = "ok") => ({ durum: d, son_basari: sb });
  const veri = { son_degisiklik: "2026-11-02T23:00:00+03:00", kaynaklar: {
    "sehirhatlari-maltepe": k("2026-11-02T23:00:00+03:00", "hata"), "mavimarmara-bostanci-buyukada": k("2026-11-02T23:00:00+03:00", "hata"),
    prenstur: k("2026-11-12T03:00:00+03:00"), tatiller: k("2026-01-01T00:00:00+03:00") } };
  const g1 = a.guncellikDurumu(veri, "2026-11-12");
  console.log("g1) 10 gun, 403'lu:", g1.fark, "eski:", g1.eski, "eski firmalar:", g1.eskiFirmalar);
  assert(g1.fark === 10 && !g1.eski && g1.eskiFirmalar.length === 0);
  const g2 = a.guncellikDurumu(veri, "2026-11-20");
  console.log("g2) 18 gun:", g2.fark, "eski:", g2.eski, "eski firmalar:", g2.eskiFirmalar);
  assert(g2.eski && g2.eskiFirmalar.includes("Şehir Hatları") && g2.eskiFirmalar.includes("Mavi Marmara") && !g2.eskiFirmalar.includes("Prenstur"));
}
// h) Pzt 23:48, Bostanci filtresi, adadan: yarin onizlemesi 3 sefer
{
  const x = calis("2026-11-09T23:48", "adadan", ["Bostancı"]);
  const beklenen = a.gunSeferleri(v, "adadan", ["Bostancı"], "2026-11-10").filter((s) => s.kalkis < "24:00");
  console.log("h) yarin onizleme:", x.r.yarinIlk.map(ad), "bugunBitti:", x.r.bugunBitti, "| yarin ilk Büyükada->Bostancı:", beklenen[0].kalkis);
  assert(!x.r.bugunBitti && x.r.yarinIlk.length === 3 && x.r.yarinIlk[0].kalkis === beklenen[0].kalkis);
  assert(x.r.yarinIlk.every((s) => s.varis_iskele === "Bostancı" && s.kalkis_iskele === "Büyükada"));
  const bos = calis("2026-11-09T23:48", "adadan", []);
  assert(bos.r.yarinIlk.length === 0);
}
// i) aciliyet esikleri
assert.strictEqual(a.aciliyet(15), "kirmizi");
assert.strictEqual(a.aciliyet(0), "kirmizi");
assert.strictEqual(a.aciliyet(16), "turuncu");
assert.strictEqual(a.aciliyet(20), "turuncu");
assert.strictEqual(a.aciliyet(21), "");
assert.strictEqual(a.aciliyet(-1), "");
// j) ara_durak metni
{
  const M = "Ara duraklar var, varış saatini kontrol ediniz";
  assert.strictEqual(a.araDurakMetni({ ara_durak: ["Heybeliada"] }), M);
  assert.strictEqual(a.araDurakMetni({ ara_durak: [] }), "");
  assert.strictEqual(a.araDurakMetni({}), "");
  const x = calis("2026-11-09T01:50", "adaya");
  const s = sira(x);
  assert(s.ara_durak.length > 0);
  const simdi = x.simdi, isk = {};
  assert(a.siradakiKart(s, simdi, isk).includes(M));
  assert(a.gelecekSatir(s, simdi, isk, true).includes(M));
  const eski = { ...s }; delete eski.ara_durak;
  assert(!a.siradakiKart(eski, simdi, isk).includes(M) && !a.gelecekSatir(eski, simdi, isk, true).includes(M));
  assert(!a.siradakiKart({ ...s, ara_durak: [] }, simdi, isk).includes(M));
  assert(!a.siradakiKart(s, simdi, isk).includes("Kınalıada"));
  console.log("j) ara_durak metni OK");
}
// k) sureMetni
assert.strictEqual(a.sureMetni("02:00", "03:10"), "1 saat 10 dakika");
assert.strictEqual(a.sureMetni("07:45", "08:20"), "35 dakika");
assert.strictEqual(a.sureMetni("15:00", "16:00"), "1 saat");
assert.strictEqual(a.sureMetni("23:50", "24:20"), "30 dakika");
assert.strictEqual(a.sureMetni("10:00", null), "");
assert.strictEqual(a.sureMetni("10:00", "10:00"), "");
assert.strictEqual(a.sureMetni("10:00", "16:00"), "");
{
  const x = calis("2026-11-09T01:50", "adaya");
  assert(a.siradakiKart(sira(x), x.simdi, {}).includes("varış 03:10 (1 saat 10 dakika)"));
  console.log("k) sureMetni OK");
}
// k2) aciliyet metni
{
  const ik0 = require("../data/iskeleler.json");
  const s0 = { yon: "adaya", firma: "Mavi Marmara", kalkis_iskele: "Bostancı", varis_iskele: "Büyükada", kalkis: "08:00", gunler: [] };
  const h0 = a.siradakiKart(s0, { dk: 480 }, ik0), h10 = a.siradakiKart(s0, { dk: 470 }, ik0);
  assert(h0.includes("⚠️ Şimdi kalkıyor ⚠️") && !h0.includes("Son 0 dakika"));
  assert(h10.includes("⚠️ Son 10 dakika ⚠️"));
  console.log("aciliyet metni OK");
}

// l) otopark P dugmesi
{
  const ik = require("../data/iskeleler.json");
  const mk = (yon, firma, kal, var_) => ({ yon, firma, kalkis_iskele: kal, varis_iskele: var_, kalkis: "08:00", gunler: [], });
  const simdi = { dk: 470 };
  const adaya = mk("adaya", "Mavi Marmara", "Bostancı", "Büyükada");
  const adadan = mk("adadan", "Mavi Marmara", "Büyükada", "Bostancı");
  const bo = a.otoparkBilgisi(adaya, ik);
  assert(bo && bo.link.includes("travelmode=driving"));
  const kart = a.siradakiKart(adaya, simdi, ik), satir = a.gelecekSatir(adaya, simdi, ik, true);
  for (const h of [kart, satir]) {
    assert(h.includes('class="park-dugme"') && h.includes("travelmode=driving") && h.includes(`aria-label="Otopark: ${bo.ad} · ${bo.mesafe} m"`));
    assert(h.indexOf("park-dugme") < h.indexOf("Yol tarifi"));
    assert(h.includes('<svg viewBox="0 0 100 100"') && h.includes('aria-hidden="true"'));
  }
  const k2 = a.siradakiKart(adadan, simdi, ik);
  assert(k2.includes("park-dugme") && k2.includes("travelmode=walking") && !k2.includes("travelmode=driving"));
  assert(a.gelecekSatir(adadan, simdi, ik, true).includes("travelmode=walking"));
  const hey = a.siradakiKart(mk("adadan", "Mavi Marmara", "Büyükada", "Heybeliada"), simdi, ik);
  assert(!hey.includes("park-dugme") && !a.gelecekSatir(mk("adaya", "Mavi Marmara", "Heybeliada", "Büyükada"), simdi, ik, true).includes("park-dugme"));
  console.log("l) otopark dugmesi OK");
}
// m) son sefer bilgisi + tus
{
  const mk = (k, i = 0) => ({ kalkis: k, firma: "Şehir Hatları", kalkis_iskele: "Bostancı", varis_iskele: "Büyükada", gece: false, i });
  const liste = (n) => Array.from({ length: n }, (_, i) => mk(`${String(10 + i).padStart(2, "0")}:00`));
  const d0 = a.sonSeferBilgisi({ bugun: liste(12), siradaki: 2 });
  assert(d0 && d0.sefer.kalkis === "21:00" && d0.kalanSayi === 10 && d0.siradakiSonMu === false);
  const c = a.sonSeferBilgisi({ bugun: liste(5), siradaki: 3 });
  assert(c && c.kalanSayi === 2 && c.sefer.kalkis === "14:00");
  assert(a.sonSeferBilgisi({ bugun: liste(5), siradaki: 4 }).siradakiSonMu === true);
  assert(a.sonSeferBilgisi({ bugun: liste(5), siradaki: -1 }) === null);
  assert(a.sonSeferBilgisi({ bugun: [], siradaki: -1 }) === null);
  const g = a.sonSeferBilgisi({ bugun: [mk("23:30"), { ...mk("24:35"), gece: true }], siradaki: 0 });
  const gt = a.sonSeferTusu(g);
  assert(g.sefer.kalkis === "24:35" && gt.includes("00:35") && gt.includes("gece") && gt.includes("Son vapur"));
  assert(gt.includes('aria-label="Bugünün son vapuru: 00:35 gece Bostancı → Büyükada Şehir Hatları"'));
  const t1 = a.sonSeferTusu({ sefer: mk("23:30"), kalanSayi: 1, siradakiSonMu: true });
  assert(t1.includes("Son vapur bu") && !t1.includes("23:30\"") );
  const t2 = a.sonSeferTusu(d0);
  assert(t2.includes("🌙 Son vapur 21:00") && t2.includes('aria-label="Bugünün son vapuru: 21:00 Bostancı → Büyükada Şehir Hatları"'));
  assert(t2.includes(`data-hedef="${a.seferKimlik(d0.sefer)}"`) && a.sonSeferTusu(null) === "");
  const x = calis("2026-11-04T20:30", "adadan");
  const bx = a.sonSeferBilgisi(x.r);
  assert(bx && bx.sefer === x.r.bugun[x.r.bugun.length - 1]);
  const y = calis("2026-11-04T19:00", "adadan");
  const by = a.sonSeferBilgisi(y.r);
  assert(by && by.kalanSayi > 3);
  const z = calis("2026-11-04T23:59", "adadan");
  assert(a.sonSeferBilgisi(z.r) === null || z.r.siradaki !== -1);
  const hs = a.gelecekSatir(bx.sefer, x.simdi, require("../data/iskeleler.json"), true);
  assert(hs.includes(`data-sefer="${a.seferKimlik(bx.sefer)}"`));
  console.log("m) son sefer bilgisi OK:", ad(bx.sefer), "kalan", bx.kalanSayi);
}
{
  const h1 = a.gecmisBaslik([1], { gecmisGizli: false });
  assert(h1.includes("(1) ▴") && h1.includes('aria-expanded="true"') && h1.includes("<button"));
  const h2 = a.gecmisBaslik([1], { gecmisGizli: true });
  assert(h2.includes("(1) ▾") && h2.includes('aria-expanded="false"'));
  assert(a.gecmisGorunen([1], { gecmisGizli: true }).length === 0 && a.gecmisGorunen([1], {}).length === 1);
  const h5 = a.gecmisBaslik([1, 2, 3, 4, 5], { eskiAcik: false });
  assert(h5.includes("(4) ▾") && h5.includes('aria-expanded="false"'));
  assert(a.gecmisBaslik([1, 2, 3], { eskiAcik: true }).includes("(2) ▴"));
  assert(a.gecmisGorunen([1, 2, 3, 4, 5], { eskiAcik: false }).length === 1 && a.gecmisGorunen([1, 2, 3, 4, 5], { eskiAcik: true }).length === 5);
  assert(a.gecmisBaslik([], {}).includes("baslik-bos"));
  console.log("n) gecmisBaslik OK");
}
{
  const si = { tarih: "2026-11-04", dk: 600 };
  const h1 = a.hedefZamani("18:30", si), h2 = a.hedefZamani("09:00", si);
  assert(h1.tarih === "2026-11-04" && h1.dk === 1110);
  assert(h2.tarih === "2026-11-05" && h2.dk === 540);
  assert(a.hedefZamani("", si) === null && a.hedefZamani("xx", si) === null && a.hedefZamani("25:00", si) === null);
  const ik = require("../data/iskeleler.json");
  const sf = { yon: "adaya", firma: "Şehir Hatları", kalkis: "10:05", varis: "10:50", kalkis_iskele: "Bostancı", varis_iskele: "Büyükada", gunler: ["hafta_ici"] };
  const kp = a.siradakiKart(sf, si, ik, true), kn = a.siradakiKart(sf, si, ik, false);
  assert(!kp.includes("acil-uyari") && !kp.includes("acil-") && !kp.includes('class="kalan"'));
  assert(kn.includes("acil-uyari") && kn.includes("acil-kirmizi"));
  const t0 = a.saatTusu(null, "2026-11-04"), t1 = a.saatTusu(h1, "2026-11-04");
  assert(t0.includes('id="saat-sec"') && t0.includes("Saat seç") && !t0.includes("saat-sifirla"));
  assert(t1.includes('id="saat-sec"') && t1.includes("saat-sifirla") && t1.includes("18:30") && t1.includes('value="18:30"'));
  console.log("o) hedefZamani / saatTusu OK");
}
console.log("TUM TESTLER GECTI");
