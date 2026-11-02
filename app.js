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

// Hizmet günü 03:00'te başlar: 03:00'ten önce hizmet tarihi dündür ve dakika 24 saat eklenir
// (00:40 -> dünün 24:40'ı). Gün tipi (tatil dahil) hizmet tarihinden hesaplanır.
function hizmetGunu(simdi) {
  if (simdi.dk >= 180) return simdi;
  const [y, m, d] = simdi.tarih.split("-").map(Number);
  const dun = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  return { tarih: dun, dk: simdi.dk + 1440 };
}

// "24:35" -> "00:35" (gece seferi)
function saatGoster(saat) {
  const [h, m] = saat.split(":").map(Number);
  return h >= 24 ? `${String(h - 24).padStart(2, "0")}:${String(m).padStart(2, "0")}` : saat;
}
function geceMi(saat) { return Number(saat.split(":")[0]) >= 24; }
function saatHtml(saat) {
  return esc(saatGoster(saat)) + (geceMi(saat) ? ' <small class="gece">gece</small>' : "");
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

// Bugünün listesi + ilk yaklaşan sefer + (bugün bittiyse) yarının ilk seferleri.
function listeHesapla(veri, yon, secili, simdi) {
  const bugun = gunSeferleri(veri, yon, secili, simdi.tarih);
  const siradaki = bugun.findIndex((s) => dk(s.kalkis) >= simdi.dk);
  const sonuc = { bugun, siradaki, yarin: [], bugunBitti: siradaki === -1 };
  if (sonuc.bugunBitti) {
    sonuc.yarin = gunSeferleri(veri, yon, secili, sonrakiGun(simdi.tarih)).slice(0, 8);
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

function gecmisSatir(s, iskeleler) {
  return `<li class="satir gecmis"><span class="saat">${saatHtml(s.kalkis)}</span>
    <span class="rota">${esc(s.kalkis_iskele)} → ${esc(s.varis_iskele)}</span>
    <span class="kalkti">· kalktı</span></li>`;
}

function siradakiKart(s, simdi, iskeleler) {
  const bilgi = [s.varis ? `varış ${saatGoster(s.varis)}` : "", s.not].filter(Boolean).join(" · ");
  return `<div class="kart siradaki" id="siradaki">
    <div class="buyuk"><span class="saat">${saatHtml(s.kalkis)}</span><span class="kalan">${kalanMetni(s.kalkis, simdi.dk)}</span></div>
    <div class="rota">${esc(s.kalkis_iskele)} → ${esc(s.varis_iskele)}</div>
    ${bilgi ? `<div class="not">${esc(bilgi)}</div>` : ""}
    <div class="alt-satir">${rozet(s.firma)}${yolDugmesi(s, iskeleler, "hap")}</div>
  </div>`;
}

function gelecekSatir(s, simdi, iskeleler, kalanGoster) {
  const bilgi = [s.varis ? `varış ${saatGoster(s.varis)}` : "", s.not].filter(Boolean).join(" · ");
  return `<li class="satir gelecek"><div class="sol"><span class="saat">${saatHtml(s.kalkis)}</span></div>
    <div class="orta"><div class="rota">${esc(s.kalkis_iskele)} → ${esc(s.varis_iskele)}</div>
    <div class="alt-satir">${rozet(s.firma, kalanGoster ? kalanMetni(s.kalkis, simdi.dk) : "")}${bilgi ? `<span class="not">${esc(bilgi)}</span>` : ""}${yolDugmesi(s, iskeleler, "hap kucuk sag")}</div></div></li>`;
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
  const simdiAl = () => hizmetGunu(testSaat || istanbulSimdi());
  const $ = (id) => document.getElementById(id);

  function kaydet() {
    localStorage.setItem("yon", durum.yon);
    localStorage.setItem("secili", JSON.stringify(durum.secili));
    localStorage.setItem("digerAcik", durum.digerAcik ? "1" : "0");
  }

  function filtreCiz() {
    const liste = durum.digerAcik ? ANA_ISKELELER.concat(DIGER_ISKELELER) : ANA_ISKELELER;
    $("filtre").innerHTML = liste.map((p) =>
      `<button class="chip" data-iskele="${p}" aria-pressed="${durum.secili.includes(p)}">${p}</button>`).join("") +
      `<button class="chip diger" data-diger="1">${durum.digerAcik ? "Diğer ▲" : "Diğer ▼"}</button>`;
  }

  // Seçili iskeleler için "Yol tarifi" bağlantıları (iskele başlığı)
  function iskeleBaslikCiz() {
    const kutu = $("iskeleler");
    if (!durum.iskeleler) { kutu.innerHTML = ""; return; }
    const parcalar = [];
    if (durum.yon === "adadan") {
      for (const [firma, n] of Object.entries(durum.iskeleler.iskeleler[ADA].noktalar)) {
        parcalar.push(`<a class="hap kucuk" href="${haritaLink(n.lat, n.lng, "walking")}" target="_blank" rel="noopener">📍 Büyükada · ${esc(firma)}</a>`);
      }
    } else {
      for (const p of durum.secili) {
        const i = durum.iskeleler.iskeleler[p];
        if (!i) continue;
        const n = Object.values(i.noktalar)[0];
        parcalar.push(`<a class="hap kucuk" href="${haritaLink(n.lat, n.lng, iskeleModu(durum.iskeleler, p))}" target="_blank" rel="noopener">📍 ${esc(p)}</a>`);
      }
    }
    kutu.innerHTML = parcalar.length ? `<span class="etiket">Yol tarifi:</span>${parcalar.join("")}` : "";
  }

  function otoparkCubuguCiz(s) {
    const b = $("otopark");
    const o = otoparkBilgisi(s, durum.iskeleler, durum.yon);
    if (!o) { b.hidden = true; document.body.classList.remove("otoparkli"); return; }
    b.hidden = false;
    document.body.classList.add("otoparkli");
    b.innerHTML = `<a href="${o.link}" target="_blank" rel="noopener"><span class="p">P</span> En yakın otopark · ${o.mesafe} m · ${esc(o.ad)}</a>`;
  }

  function ciz(kaydir) {
    if (!durum.veri) return;
    const simdi = simdiAl();
    const r = listeHesapla(durum.veri, durum.yon, durum.secili, simdi);
    for (const y of ["adadan", "adaya"]) $("sekme-" + y).setAttribute("aria-selected", String(y === durum.yon));
    $("yukleniyor").hidden = true;

    const bolge = [];
    const kesim = r.siradaki === -1 ? r.bugun.length : r.siradaki;
    const gecmis = r.bugun.slice(0, kesim);
    let sonraki = null;

    if (gecmis.length) {
      const son2 = gecmis.slice(-2), eski = gecmis.slice(0, -2);
      bolge.push(`<section class="bolum gecmis-bolum"><h2>Geçmiş Seferler</h2>
        <svg class="dalga" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 60 C60 30 120 90 200 55 S340 25 400 60 V120 H0Z"/><path d="M0 85 C80 60 150 110 230 80 S350 60 400 90 V120 H0Z"/></svg>
        ${eski.length ? `<button class="eski-dugme" id="eski-dugme" aria-expanded="${durum.eskiAcik}">Önceki seferler (${eski.length}) ${durum.eskiAcik ? "▲" : "▼"}</button>` : ""}
        <ul class="kart cam-liste">${(durum.eskiAcik ? eski : []).concat(son2).map((s) => gecmisSatir(s)).join("")}</ul></section>`);
    }
    if (r.siradaki !== -1) {
      sonraki = r.bugun[r.siradaki];
      bolge.push(`<section class="bolum"><h2>SIRADAKİ Sefer</h2>${siradakiKart(sonraki, simdi, durum.iskeleler)}</section>`);
      const gelecek = r.bugun.slice(r.siradaki + 1);
      if (gelecek.length) {
        bolge.push(`<section class="bolum"><h2>Gelecek Seferler</h2><ul class="kart cam-liste">${gelecek.map((s) => gelecekSatir(s, simdi, durum.iskeleler, true)).join("")}</ul></section>`);
      }
    } else {
      bolge.push(`<section class="bolum" id="siradaki"><div class="kart bos">${r.bugun.length ? "Bugün başka sefer yok" : "Seçili iskeleler için bugün sefer yok"}</div></section>`);
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
      if (el) el.scrollIntoView({ block: "center" });
    }
    const t = $("test");
    t.hidden = !testSaat;
    t.textContent = testSaat ? `Test saati: ${testSaat.tarih} ${String(Math.floor(testSaat.dk / 60)).padStart(2, "0")}:${String(testSaat.dk % 60).padStart(2, "0")}` : "";
  }

  function gunFarki(tarih1, tarih2) {
    const t = (x) => { const [y, m, d] = x.split("-").map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((t(tarih1) - t(tarih2)) / 86400000);
  }

  // Başlık altındaki güncellik satırı
  function guncellikCiz() {
    const el = $("guncellik");
    const v = durum.veri;
    if (!v || !v.son_kontrol) { el.hidden = true; return; }
    const tarihTr = (iso) => new Date(iso).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", year: "numeric" });
    const gunStr = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
    const fark = gunFarki(simdiAl().tarih, gunStr(v.son_kontrol));
    const gorece = fark <= 0 ? "bugün" : `${fark} gün önce`;
    const parcalar = [`Son kontrol: ${tarihTr(v.son_kontrol)} (${gorece})`];
    if (v.son_degisiklik) parcalar.push(`Tarife değişikliği: ${tarihTr(v.son_degisiklik)}`);
    const eski = fark > 10;
    const hatali = Object.entries(v.kaynaklar).filter(([, k]) => k.durum === "hata")
      .map(([a]) => KAYNAK_AD[a.replace(/-.*/, "")] || a);
    if (hatali.length) parcalar.push([...new Set(hatali)].map((a) => `${a}: eski veri`).join(", "));
    if (eski) parcalar.push("Veriler güncel olmayabilir");
    el.textContent = parcalar.join(" · ");
    el.className = "guncellik" + (eski || hatali.length ? " uyari" : "");
    el.hidden = false;
  }

  function altCiz() {
    const v = durum.veri;
    const parcalar = [];
    if (v) {
      const hatali = Object.entries(v.kaynaklar).filter(([, k]) => k.durum === "hata");
      if (hatali.length) {
        parcalar.push(`<p class="uyari">Uyarı: şu kaynaklar güncellenemedi, eski veri kullanılıyor: ${hatali.map(([a]) => esc(a)).join(", ")}.</p>`);
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
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

if (typeof module !== "undefined") {
  module.exports = { hizmetGunu, saatGoster, saatiCoz, gunTipi, sonrakiGun, listeHesapla, gunSeferleri, kalanMetni, haritaLink, noktaBul, otoparkBilgisi };
}
