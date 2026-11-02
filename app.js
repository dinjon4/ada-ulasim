// Ada Vapur: Büyükada sefer listesi. Çerçeve yok; saat hesabı cihazda, İstanbul saatine göre.
"use strict";

const ADA = "Büyükada";
const ANA_ISKELELER = ["Maltepe", "Bostancı", "Kartal"];
const DIGER_ISKELELER = ["Kadıköy", "Kabataş", "Heybeliada"];
const FIRMA_SINIF = { "Şehir Hatları": "f-sh", "Mavi Marmara": "f-mm", "Prenstur": "f-pt" };
const KAYNAK_AD = { sehirhatlari: "Şehir Hatları", mavimarmara: "Mavi Marmara", prenstur: "Prenstur", tatiller: "Tatil listesi" };
const RESMI_LINKLER = [
  ["Şehir Hatları Adalar tarifeleri", "https://sehirhatlari.istanbul/tr/seferler/ic-hatlar/adalar-hatlari/"],
  ["Mavi Marmara tarifeleri", "https://mavimarmara.net/tarifeler/"],
  ["Prenstur tarifesi (Kartal)", "https://www.prenstur.net/index3e95.html?option=com_content&view=article&id=75&Itemid=477"],
  ["Şehir Hatları iptal seferler", "https://sehirhatlari.istanbul/tr/iptal-seferler"],
];

// ---------- Saat / gün hesabı (saf fonksiyonlar, node'da test edilebilir) ----------

// "2026-11-08T21:30" gibi bir metni İstanbul yerel saati olarak yorumlar.
function saatiCoz(metin) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(metin || "");
  return m ? { tarih: m[1], dk: Number(m[2]) * 60 + Number(m[3]) } : null;
}

// Gerçek an: Europe/Istanbul tarih ve dakika (cihaz saat dilimi kullanılmaz).
function istanbulSimdi() {
  const parcalar = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date());
  const p = {};
  for (const x of parcalar) p[x.type] = x.value;
  return { tarih: `${p.year}-${p.month}-${p.day}`, dk: Number(p.hour) * 60 + Number(p.minute) };
}

// "24:35" -> "00:35" (gece seferi)
function saatGoster(saat) {
  const [h, m] = saat.split(":").map(Number);
  return h >= 24 ? `${String(h - 24).padStart(2, "0")}:${String(m).padStart(2, "0")}` : saat;
}
function geceMi(saat) { return Number(saat.split(":")[0]) >= 24; }
function saatHtml(saat, gece) {
  return esc(saatGoster(saat)) + (gece || geceMi(saat) ? ' <small class="gece">gece</small>' : "");
}

function oncekiGun(tarih) {
  const [y, m, d] = tarih.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

function sonrakiGun(tarih) {
  const [y, m, d] = tarih.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

// Gün tipi: tatil ve Pazar -> "pazar", Cumartesi -> "cumartesi", diğerleri "hafta_ici".
function gunTipi(tarih, tatiller) {
  if ((tatiller || []).includes(tarih)) return "pazar";
  const [y, m, d] = tarih.split("-").map(Number);
  const gun = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return gun === 0 ? "pazar" : gun === 6 ? "cumartesi" : "hafta_ici";
}

function dk(saat) {
  const [h, m] = saat.split(":").map(Number);
  return h * 60 + m;
}

// Yolculuk süresi: "1 saat 10 dakika" / "35 dakika" / "1 saat"; varış yoksa veya süre bozuksa "".
function sureMetni(kalkis, varis) {
  if (!kalkis || !varis) return "";
  let fark = dk(varis) - dk(kalkis);
  if (fark < 0) fark += 1440;
  if (!(fark > 0 && fark <= 300)) return "";
  const sa = Math.floor(fark / 60), d = fark % 60;
  return [sa ? `${sa} saat` : "", d ? `${d} dakika` : ""].filter(Boolean).join(" ");
}

function bilgiMetni(s) {
  const sure = sureMetni(s.kalkis, s.varis);
  return [s.varis ? `varış ${saatGoster(s.varis)}${sure ? ` (${sure})` : ""}` : "", s.not].filter(Boolean).join(" · ");
}

// Seferin "öteki" iskelesi (Büyükada dışındaki uç).
function digerIskele(s) {
  return s.yon === "adadan" ? s.varis_iskele : s.kalkis_iskele;
}

function gunSeferleri(veri, yon, secili, tarih) {
  const tip = gunTipi(tarih, veri.tatiller);
  return veri.seferler
    .filter((s) => s.yon === yon && s.gunler.includes(tip) && secili.includes(digerIskele(s)))
    .sort((a, b) => dk(a.kalkis) - dk(b.kalkis) || a.firma.localeCompare(b.firma, "tr"));
}

function dkYaz(toplamDk) {
  return `${String(Math.floor(toplamDk / 60)).padStart(2, "0")}:${String(toplamDk % 60).padStart(2, "0")}`;
}

// Dünün gün tipine göre kalkışı >= 24:00 olan seferler, bugünün ilk saatlerine (00:xx, "gece") çekilir.
function dunGeceSeferleri(veri, yon, secili, tarih) {
  const dun = oncekiGun(tarih);
  return gunSeferleri(veri, yon, secili, dun)
    .filter((s) => dk(s.kalkis) >= 1440)
    .map((s) => Object.assign({}, s, {
      kalkis: dkYaz(dk(s.kalkis) - 1440),
      varis: s.varis ? dkYaz(dk(s.varis) - 1440) : s.varis,
      gece: true,
    }));
}

// Bugünün listesi: dünün gece seferleri + bugünün tüm seferleri (24+ olanlar sonda, "gece").
// "Şimdi" = İstanbul takvim günü + dakikası; sabit gün sınırı yok.
function listeHesapla(veri, yon, secili, simdi) {
  const bugun = dunGeceSeferleri(veri, yon, secili, simdi.tarih)
    .concat(gunSeferleri(veri, yon, secili, simdi.tarih))
    .sort((a, b) => dk(a.kalkis) - dk(b.kalkis) || a.firma.localeCompare(b.firma, "tr"));
  const siradaki = bugun.findIndex((s) => dk(s.kalkis) >= simdi.dk);
  const yarinGun = sonrakiGun(simdi.tarih);
  const yarinSeferleri = gunSeferleri(veri, yon, secili, yarinGun).filter((s) => dk(s.kalkis) < 1440);
  const sonuc = { bugun, siradaki, yarin: [], yarinIlk: yarinSeferleri.slice(0, 3), bugunBitti: siradaki === -1 };
  if (sonuc.bugunBitti) {
    // yarının yalnız <24:00 seferleri (24+ olanlar yarının listesine ait gece seferleri değil, zaten bugünün listesinde)
    sonuc.yarin = yarinSeferleri.slice(0, 8);
  }
  return sonuc;
}

function kalanMetni(kalkis, simdiDk) {
  const fark = dk(kalkis) - simdiDk;
  if (fark < 0) return "kalktı";
  if (fark === 0) return "şimdi kalkıyor";
  if (fark < 60) return `${fark} dk sonra`;
  return `${Math.floor(fark / 60)} sa ${fark % 60} dk sonra`;
}

// Kalan dakikaya göre aciliyet: 0-15 kırmızı, 16-20 turuncu.
function aciliyet(kalanDk) {
  if (kalanDk >= 0 && kalanDk <= 15) return "kirmizi";
  if (kalanDk > 15 && kalanDk <= 20) return "turuncu";
  return "";
}

// ---------- Veri güncelliği ----------
const ESKI_GUN = 14;

function istanbulGunu(iso) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

function gunFarki(tarih1, tarih2) {
  const t = (x) => { const [y, m, d] = x.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(tarih1) - t(tarih2)) / 86400000);
}

// Tarife kaynaklarının (tatiller hariç) son başarılı çekim zamanlarına göre güncellik.
function guncellikDurumu(veri, bugunTarih) {
  const yedek = veri.son_degisiklik || veri.son_kontrol;
  const firmaEn = {}; // firma -> en eski son_basari
  let enEski = null;
  for (const [ad, k] of Object.entries(veri.kaynaklar || {})) {
    if (ad === "tatiller") continue;
    const t = k.son_basari || yedek;
    if (!t) continue;
    const firma = KAYNAK_AD[ad.replace(/-.*/, "")] || ad;
    if (!firmaEn[firma] || t < firmaEn[firma]) firmaEn[firma] = t;
    if (!enEski || t < enEski) enEski = t;
  }
  if (!enEski) return null;
  const fark = gunFarki(bugunTarih, istanbulGunu(enEski));
  const eskiFirmalar = Object.entries(firmaEn)
    .filter(([, t]) => gunFarki(bugunTarih, istanbulGunu(t)) > ESKI_GUN).map(([f]) => f);
  return { enEski, fark, eski: fark > ESKI_GUN, eskiFirmalar };
}

// ---------- Harita bağlantıları ----------

// Firmanın o iskeledeki noktası (yoksa iskelenin ilk noktası).
function noktaBul(iskeleler, iskele, firma) {
  const i = iskeleler && iskeleler.iskeleler && iskeleler.iskeleler[iskele];
  if (!i) return null;
  return i.noktalar[firma] || Object.values(i.noktalar)[0] || null;
}

function haritaLink(lat, lng, mod) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${mod}`;
}

// Adalar (Büyükada/Heybeliada) -> yürüyerek, karadaki iskeleler -> toplu taşıma.
function iskeleModu(iskeleler, iskele) {
  const i = iskeleler && iskeleler.iskeleler && iskeleler.iskeleler[iskele];
  return i && i.kara ? "transit" : "walking";
}

// ---------- Görünüm ----------

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function yolLinki(s, iskeleler) {
  const nokta = noktaBul(iskeleler, s.kalkis_iskele, s.firma);
  if (!nokta) return "";
  return haritaLink(nokta.lat, nokta.lng, iskeleModu(iskeleler, s.kalkis_iskele));
}

function yolDugmesi(s, iskeleler, sinif) {
  const l = yolLinki(s, iskeleler);
  return l ? `<a class="${sinif}" href="${l}" target="_blank" rel="noopener">📍 Yol tarifi</a>` : "";
}

// Alt çubuk: seferin KARA tarafındaki iskelenin en yakın otoparkı (Heybeliada kara değil -> null).
function otoparkBilgisi(s, iskeleler, yon) {
  if (!s || !iskeleler) return null;
  const kara = digerIskele(s);
  const i = iskeleler.iskeleler[kara];
  if (!i || !i.kara) return null;
  const nokta = noktaBul(iskeleler, kara, s.firma);
  const o = nokta && nokta.otopark && nokta.otopark[0];
  if (!o) return null;
  const link = yon === "adaya"
    ? haritaLink(o.lat, o.lng, "driving")
    : `https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}`;
  return { ad: o.ad, mesafe: o.mesafe_m, link, iskele: kara };
}

function rozet(firma, ek) {
  return `<span class="rozet ${FIRMA_SINIF[firma] || ""}">${esc(firma)}${ek ? " · " + esc(ek) : ""}</span>`;
}

// Kompakt tek satır (yarın önizlemesi): "06:20 Büyükada → Bostancı · Mavi Marmara"
function kompaktSatir(s) {
  return `<li class="kompakt-satir"><span class="nokta ${FIRMA_SINIF[s.firma] || ""}"></span><span class="saat">${esc(s.kalkis)}</span> ${esc(s.kalkis_iskele)} → ${esc(s.varis_iskele)} <span class="firma">· ${esc(s.firma)}</span></li>`;
}

const ARA_DURAK_METNI = "Ara duraklar var, varış saatini kontrol ediniz";
function araDurakMetni(s) {
  return Array.isArray(s.ara_durak) && s.ara_durak.length > 0 ? ARA_DURAK_METNI : "";
}

function siradakiKart(s, simdi, iskeleler) {
  const bilgi = bilgiMetni(s);
  const kalanDk = dk(s.kalkis) - simdi.dk;
  const acil = aciliyet(kalanDk);
  return `<div class="kart siradaki${acil ? " acil-" + acil : ""}" id="siradaki">
    <div class="buyuk"><span class="saat">${saatHtml(s.kalkis, s.gece)}</span><span class="kalan">${kalanMetni(s.kalkis, simdi.dk)}</span></div>
    ${acil ? `<div class="acil-uyari" role="alert">⚠️ Son ${kalanDk} dakika ⚠️</div>` : ""}
    <div class="rota">${esc(s.kalkis_iskele)} → ${esc(s.varis_iskele)}</div>
    ${bilgi ? `<div class="not">${esc(bilgi)}</div>` : ""}
    ${araDurakMetni(s) ? `<div class="ara-durak">ⓘ ${esc(araDurakMetni(s))}</div>` : ""}
    <div class="alt-satir">${rozet(s.firma)}${yolDugmesi(s, iskeleler, "hap")}</div>
  </div>`;
}

function gelecekSatir(s, simdi, iskeleler, kalanGoster) {
  const bilgi = bilgiMetni(s);
  return `<li class="satir gelecek"><div class="sol"><span class="saat">${saatHtml(s.kalkis, s.gece)}</span></div>
    <div class="orta"><div class="rota">${esc(s.kalkis_iskele)} → ${esc(s.varis_iskele)}</div>
    <div class="alt-satir">${rozet(s.firma, kalanGoster ? kalanMetni(s.kalkis, simdi.dk) : "")}${bilgi ? `<span class="not">${esc(bilgi)}</span>` : ""}${araDurakMetni(s) ? `<span class="not ara-durak">ⓘ ${esc(araDurakMetni(s))}</span>` : ""}${yolDugmesi(s, iskeleler, "hap kucuk sag")}</div></div></li>`;
}

if (typeof document !== "undefined") {
  const durum = {
    yon: localStorage.getItem("yon") === "adaya" ? "adaya" : "adadan",
    secili: JSON.parse(localStorage.getItem("secili") || "null") || ANA_ISKELELER.slice(),
    digerAcik: localStorage.getItem("digerAcik") === "1",
    eskiAcik: false,
    veri: null, iskeleler: null,
  };
  const testSaat = saatiCoz(new URLSearchParams(location.search).get("t"));
  const simdiAl = () => testSaat || istanbulSimdi();
  const $ = (id) => document.getElementById(id);

  function kaydet() {
    localStorage.setItem("yon", durum.yon);
    localStorage.setItem("secili", JSON.stringify(durum.secili));
    localStorage.setItem("digerAcik", durum.digerAcik ? "1" : "0");
  }

  function filtreCiz() {
    const cip = (p) => `<button class="chip" data-iskele="${p}" aria-pressed="${durum.secili.includes(p)}">${p}</button>`;
    $("filtre").innerHTML =
      `<div class="chip-satir">${ANA_ISKELELER.map(cip).join("")}<button class="chip diger" data-diger="1" aria-expanded="${durum.digerAcik}">Diğer ${durum.digerAcik ? "▲" : "▼"}</button></div>` +
      (durum.digerAcik ? `<div class="chip-satir">${DIGER_ISKELELER.map(cip).join("")}</div>` : "");
  }

  // Sayfa altı: "İskelelere yol tarifi" (Büyükada iskeleleri + seçili kara iskeleleri)
  function iskeleBaslikCiz() {
    const kutu = $("iskele-yol");
    if (!durum.iskeleler) { kutu.hidden = true; return; }
    const parcalar = [];
    for (const [firma, n] of Object.entries(durum.iskeleler.iskeleler[ADA].noktalar)) {
      parcalar.push(`<a class="hap kucuk" href="${haritaLink(n.lat, n.lng, "walking")}" target="_blank" rel="noopener">📍 Büyükada · ${esc(firma)}</a>`);
    }
    for (const p of durum.secili) {
      const i = durum.iskeleler.iskeleler[p];
      if (!i) continue;
      const n = Object.values(i.noktalar)[0];
      parcalar.push(`<a class="hap kucuk" href="${haritaLink(n.lat, n.lng, iskeleModu(durum.iskeleler, p))}" target="_blank" rel="noopener">📍 ${esc(p)}</a>`);
    }
    kutu.innerHTML = `<h2>İskelelere yol tarifi</h2><div class="hap-sarmal">${parcalar.join("")}</div>`;
    kutu.hidden = false;
  }

  function otoparkCubuguCiz(s) {
    const b = $("otopark");
    const o = otoparkBilgisi(s, durum.iskeleler, durum.yon);
    if (!o) { b.hidden = true; document.body.classList.remove("otoparkli"); return; }
    b.hidden = false;
    document.body.classList.add("otoparkli");
    document.documentElement.style.setProperty("--cubuk", b.offsetHeight + "px");
    b.innerHTML = `<a href="${o.link}" target="_blank" rel="noopener"><span class="p">P</span><span class="metin"><span class="ust">En yakın otopark · ${o.mesafe} m</span><span class="ad">${esc(o.ad)}</span></span></a>`;
  }

  function ciz(kaydir) {
    if (!durum.veri) return;
    const simdi = simdiAl();
    const r = listeHesapla(durum.veri, durum.yon, durum.secili, simdi);
    if (!durum.secili.length) { r.bugun = []; r.siradaki = -1; r.yarin = []; r.bugunBitti = true; r.hepsiFiltreli = true; }
    for (const y of ["adadan", "adaya"]) $("sekme-" + y).setAttribute("aria-selected", String(y === durum.yon));
    $("yukleniyor").hidden = true;

    const bolge = [];
    const kesim = r.siradaki === -1 ? r.bugun.length : r.siradaki;
    const gecmis = r.bugun.slice(0, kesim);
    let sonraki = null;

    if (gecmis.length) {
      const son2 = gecmis.slice(-1), eski = gecmis.slice(0, -1);
      const baslik = eski.length
        ? `<h2><button class="baslik-dugme" id="eski-dugme" aria-expanded="${durum.eskiAcik}">Geçmiş Seferler (${eski.length}) ${durum.eskiAcik ? "▴" : "▾"}</button></h2>`
        : "<h2>Geçmiş Seferler</h2>";
      bolge.push(`<section class="bolum gecmis-bolum">${baslik}
        <ul class="kompakt-liste">${(durum.eskiAcik ? eski : []).concat(son2).map(kompaktSatir).join("")}</ul></section>`);
    }
    if (r.siradaki !== -1) {
      sonraki = r.bugun[r.siradaki];
      bolge.push(`<section class="bolum"><h2>SIRADAKİ Sefer</h2>${siradakiKart(sonraki, simdi, durum.iskeleler)}</section>`);
      const gelecek = r.bugun.slice(r.siradaki + 1);
      if (gelecek.length) {
        bolge.push(`<section class="bolum"><h2>Gelecek Seferler</h2><ul class="kart cam-liste">${gelecek.map((s) => gelecekSatir(s, simdi, durum.iskeleler, true)).join("")}</ul></section>`);
      }
      if (r.yarinIlk.length) {
        bolge.push(`<section class="bolum yarin-onizleme"><h2>Yarın ilk seferler</h2><ul class="kompakt-liste">${r.yarinIlk.map(kompaktSatir).join("")}</ul></section>`);
      }
    } else {
      bolge.push(`<section class="bolum" id="siradaki"><div class="kart bos">${r.hepsiFiltreli ? "Tüm iskeleler filtrelendi" : r.bugun.length ? "Bugün başka sefer yok" : "Seçili iskeleler için bugün sefer yok"}</div></section>`);
      if (r.yarin.length) {
        sonraki = r.yarin[0];
        bolge.push(`<section class="bolum"><h2>Yarın ilk seferler</h2><ul class="kart cam-liste">${r.yarin.map((s) => gelecekSatir(s, simdi, durum.iskeleler, false)).join("")}</ul></section>`);
      }
    }
    $("liste").innerHTML = bolge.join("");
    const ed = $("eski-dugme");
    if (ed) ed.addEventListener("click", () => { durum.eskiAcik = !durum.eskiAcik; ciz(false); });
    otoparkCubuguCiz(sonraki);

    if (kaydir) {
      const el = $("siradaki");
      if (el) {
        // otopark çubuğunu hesaba kat: kartı çubuğun üstündeki görünür alanın ortasına getir
        const cubuk = $("otopark").hidden ? 0 : $("otopark").offsetHeight;
        const r2 = el.getBoundingClientRect();
        const gorunur = window.innerHeight - cubuk;
        window.scrollTo(0, Math.max(0, r2.top + window.scrollY - (gorunur - r2.height) / 2));
      }
    }
    const t = $("test");
    t.hidden = !testSaat;
    t.textContent = testSaat ? `Test saati: ${testSaat.tarih} ${String(Math.floor(testSaat.dk / 60)).padStart(2, "0")}:${String(testSaat.dk % 60).padStart(2, "0")}` : "";
  }

  // Başlık altındaki güncellik satırı
  function guncellikCiz() {
    const el = $("guncellik");
    const v = durum.veri;
    if (!v || !v.kaynaklar) { el.hidden = true; return; }
    const g = guncellikDurumu(v, simdiAl().tarih);
    if (!g) { el.hidden = true; return; }
    const tarihTr = (iso) => new Date(iso).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", year: "numeric" });
    const gorece = g.fark <= 0 ? "bugün" : `${g.fark} gün önce`;
    const parcalar = [`Tarifeler: ${tarihTr(g.enEski)} (${gorece})`];
    if (v.son_degisiklik) parcalar.push(`Tarife değişikliği: ${tarihTr(v.son_degisiklik)}`);
    for (const f of g.eskiFirmalar) parcalar.push(`${f}: eski veri`);
    if (g.eski) parcalar.push("Tarifeler güncel olmayabilir");
    el.textContent = parcalar.join(" · ");
    el.className = "guncellik" + (g.eski ? " uyari" : "");
    el.hidden = false;
  }

  function altCiz() {
    const v = durum.veri;
    const parcalar = [];
    if (v) {
      const gd = guncellikDurumu(v, simdiAl().tarih);
      if (gd && gd.eskiFirmalar.length) {
        parcalar.push(`<p class="uyari">Uyarı: şu kaynaklar uzun süredir güncellenemedi, eski veri kullanılıyor: ${gd.eskiFirmalar.map(esc).join(", ")}.</p>`);
      }
      if (v.kaynaklar.prenstur && v.kaynaklar.prenstur.degisti) {
        parcalar.push('<p class="uyari">Prenstur tarifesi değişmiş olabilir; gösterilen saatler eski olabilir.</p>');
      }
      if (v.notlar && v.notlar.Prenstur) parcalar.push(`<p>${esc(v.notlar.Prenstur)}</p>`);
      const g = new Date(v.son_kontrol || v.guncelleme);
      const metin = isNaN(g) ? "" : g.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" });
      parcalar.push(`<p>Veri: ${esc(metin)}</p>`);
    }
    parcalar.push('<div class="linkler">' + RESMI_LINKLER.map(([ad, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(ad)}</a>`).join("") + "</div>");
    parcalar.push("<p>Resmi değildir, sefer öncesi firmayı kontrol edin.</p>");
    $("alt").innerHTML = parcalar.join("");
  }

  document.querySelector(".sekmeler").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-yon]");
    if (!b) return;
    durum.yon = b.dataset.yon; kaydet(); iskeleBaslikCiz(); ciz(true);
  });
  $("filtre").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.diger) {
      durum.digerAcik = !durum.digerAcik;
    } else {
      const p = b.dataset.iskele;
      durum.secili = durum.secili.includes(p) ? durum.secili.filter((x) => x !== p) : durum.secili.concat(p);
    }
    kaydet(); filtreCiz(); iskeleBaslikCiz(); ciz(true);
  });

  async function yukle() {
    const [v, i] = await Promise.all([
      fetch("data/seferler.json").then((r) => r.json()),
      fetch("data/iskeleler.json").then((r) => r.json()).catch(() => null),
    ]);
    durum.veri = v; durum.iskeleler = i;
    filtreCiz(); iskeleBaslikCiz(); altCiz(); guncellikCiz(); ciz(true);
  }

  filtreCiz();
  altCiz();
  yukle().catch(() => { $("yukleniyor").textContent = "Veri yüklenemedi. İnternet bağlantısını kontrol edin."; });
  setInterval(() => { ciz(false); guncellikCiz(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) ciz(false); });
  // Service worker: güncellemeyi hemen al, yeni sürüm devralınca BİR kez yeniden yükle
  let swKayit = null;
  if ("serviceWorker" in navigator) {
    let yenilendi = false;
    const eskiDenetleyici = !!navigator.serviceWorker.controller; // ilk kurulumda yeniden yükleme gerekmez
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (yenilendi || !eskiDenetleyici) return;
      yenilendi = true;
      location.reload();
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
      swKayit = reg;
      reg.update().catch(() => {});
    }).catch(() => {});
    document.addEventListener("visibilitychange", () => { if (!document.hidden && swKayit) swKayit.update().catch(() => {}); });
  }

  // Yenile düğmesi: önbelleği sil, sayfayı (varsa ?t= korunarak) yeniden yükle
  $("yenile").addEventListener("click", async () => {
    const toast = $("toast");
    if (!navigator.onLine) {
      toast.textContent = "Bağlantı yok";
      toast.hidden = false;
      setTimeout(() => { toast.hidden = true; }, 2500);
      return;
    }
    $("yenile").classList.add("doner");
    try { if (swKayit) await swKayit.update(); } catch (e) {}
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
    const p = new URLSearchParams();
    const t = new URLSearchParams(location.search).get("t");
    if (t) p.set("t", t);
    p.set("r", Date.now());
    location.replace(location.pathname + "?" + p.toString());
  });
}

if (typeof module !== "undefined") {
  module.exports = { guncellikDurumu, saatGoster, saatiCoz, gunTipi, sonrakiGun, listeHesapla, gunSeferleri, kalanMetni, aciliyet, haritaLink, noktaBul, otoparkBilgisi, sureMetni, araDurakMetni, siradakiKart, gelecekSatir };
}
