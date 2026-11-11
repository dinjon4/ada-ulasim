"""Adalar (Kinaliada, Burgazada, Heybeliada, Buyukada) vapur/motor seferlerini toplayip data/seferler.json uretir.

Bir sefer kaydi, bir ucu ada olan her (kalkis, varis) cifti icin tutulur: ada<->kara (Maltepe, Bostanci,
Kartal, Kadikoy, Kabatas) ve adalar arasi. Yon uygulamada secili adaya gore hesaplanir; "yon" alani
yalniz uyumluluk icin Buyukada'ya gore yazilir (adadan/adaya) ya da adalar arasi seferde "adalar_arasi".

Kaynaklar: Şehir Hatları (HTML tablolar), Mavi Marmara (HTML tablo), Prenstur (elle girilmis
data/prenstur.json + resim degisti mi kontrolu). Her kaynak ayri ayri basarisiz olabilir;
basarisiz/bos kaynak icin onceki seferler.json'daki seferler korunur.

Kullanim: python scraper/topla.py   (cikis kodu 1: bir kaynak hatali veya Prenstur tarifesi degisti)
"""
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

KOK = Path(__file__).resolve().parent.parent
VERI = KOK / "data"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/17.0 Safari/605.1.15")

SH_TABAN = "https://sehirhatlari.istanbul/tr/seferler/ic-hatlar/adalar-hatlari/"
SH_SAYFALAR = {
    "sehirhatlari-maltepe": SH_TABAN + "maltepe-buyukada-heybeliada-burgazada-kinaliada-hatti-2020",
    "sehirhatlari-bostanci": SH_TABAN + "bostanci-adalar-ring-hatti-770",
    "sehirhatlari-kabatas": SH_TABAN + "kabatasadalar-177",
}
MM_TABAN = "https://mavimarmara.net/tarifeler/"
MM_SAYFALAR = {
    "mavimarmara-bostanci-buyukada": ("bostanci-buyukada", "Bostancı", "Büyükada"),
    "mavimarmara-buyukada-bostanci": ("buyukada-bostanci", "Büyükada", "Bostancı"),
    "mavimarmara-kabatas-buyukada": ("kabatas-buyukada", "Kabataş", "Büyükada"),
    "mavimarmara-buyukada-kabatas": ("buyukada-kabatas", "Büyükada", "Kabataş"),
}
PRENSTUR_SAYFA = "https://www.prenstur.net/index3e95.html?option=com_content&view=article&id=75&Itemid=477"
PRENSTUR_TABAN = "https://www.prenstur.net/"
TATIL_URL = "https://date.nager.at/api/v3/PublicHolidays/{yil}/TR"

ADA = "Büyükada"  # yalniz "yon" uyumluluk alani ve Mavi Marmara/Prenstur turetmeleri icin
ADALAR = ["Kınalıada", "Burgazada", "Heybeliada", "Büyükada"]
# Eminönü yalniz ara_durak olarak geciyor (kendi sefer kaydi yok), bu yuzden burada degil
ILGILI = {"Maltepe", "Bostancı", "Kartal", "Kadıköy", "Kabataş"}
HEPSI = ["hafta_ici", "cumartesi", "pazar"]
HAFTA_ICI_CT = ["hafta_ici", "cumartesi"]
# Hizmet gunu modeli: gece yarisini gecen saatler 24+ yazilir ("24:35"), gunler tablonun kendisinden gelir

SAAT_RE = re.compile(r"(\d{1,2}):(\d{2})")


def indir(url, **kw):
    r = requests.get(url, headers={"User-Agent": UA}, timeout=30, **kw)
    r.raise_for_status()
    return r


def saat_dk(s):
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def hh_mm_24(s, ofset):
    """'HH:MM' dondurur; ofset>=1 ise (gece yarisi gecildi) saate 24 eklenir: 00:35 -> 24:35."""
    t = hh_mm(s)
    if t is None or not ofset:
        return t
    return f"{int(t[:2]) + 24 * ofset:02d}{t[2:]}"


def hh_mm(s):
    m = SAAT_RE.search(s)
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None


def kayit(firma, kalkis_iskele, varis_iskele, kalkis, varis, gunler, not_="", kaynak="", ara_durak=()):
    if kalkis_iskele in ADALAR and varis_iskele in ADALAR:
        yon = "adalar_arasi"
    else:
        yon = "adadan" if kalkis_iskele == ADA else "adaya"  # eski uyumluluk (Buyukada'ya gore)
    return {"firma": firma, "kalkis_iskele": kalkis_iskele, "varis_iskele": varis_iskele,
            "kalkis": kalkis, "varis": varis, "gunler": list(gunler), "yon": yon,
            "not": not_, "kaynak": kaynak, "ara_durak": list(ara_durak)}


def tekille(seferler):
    """Ayni sefer birden fazla tabloda cikarsa gunleri birlestirir."""
    cikti = {}
    for s in seferler:
        k = (s["firma"], s["kalkis_iskele"], s["varis_iskele"], s["kalkis"], s["varis"], s["not"])
        if k in cikti:
            cikti[k]["gunler"] = [g for g in HEPSI if g in set(cikti[k]["gunler"]) | set(s["gunler"])]
        else:
            cikti[k] = dict(s)
    return list(cikti.values())


# ---------- Şehir Hatları ----------

def sh_gunler(baslik):
    """Tablo basligindan gun tipi. Donus: (gunler, yildiz_hafta_ici_mi)."""
    b = baslik.upper()
    if "YAPILMAZ" in b:           # "Her gün * Pazar ve Resmi Tatil Günleri Yapılmaz"
        return HEPSI, True        # yildizli saatler pazar/tatilde yok
    if "PAZAR" in b:
        return ["pazar"], False
    if "HAFTA" in b:
        return HAFTA_ICI_CT, False
    return HEPSI, False


def sehirhatlari(url, kaynak="sehirhatlari"):
    soup = BeautifulSoup(indir(url).text, "html.parser")
    seferler = []
    tablolar = soup.find_all("table")
    if not tablolar:
        raise ValueError("tablo bulunamadi")
    for tablo in tablolar:
        baslik = tablo.select_one("td.table-head")
        gunler, yildiz_kurali = sh_gunler(baslik.get_text(" ", strip=True) if baslik else "")
        duraklar = [th.get_text(strip=True) for th in tablo.find_all("th")]
        onceki_ilk = None
        ofset = 0
        for satir in tablo.select("tr.hours-tr"):
            hucreler = [c.get_text(" ", strip=True) for c in satir.find_all("td")]
            if len(hucreler) != len(duraklar):
                continue
            saatler = [hh_mm(h) for h in hucreler]
            yildizli = ["*" in h for h in hucreler]
            ilk = next((saat_dk(s) for s in saatler if s), None)
            if ilk is None:
                continue
            # satirlar kronolojik: ilk saat 12 saatten fazla geriye giderse gece yarisi gecilmistir
            # (kucuk geri adimlar, satirin ilk sutunlarinin '-' olmasindan kaynaklanir)
            if onceki_ilk is not None and ilk + 720 < onceki_ilk:
                ofset = 1
            onceki_ilk = max(ilk, onceki_ilk or 0) if ofset == 0 else ilk
            # satir icinde de gece yarisi gecilebilir (ornegin 23:30 -> 00:30)
            gun_ofset, son = [], None
            for s in saatler:
                if s is None:
                    gun_ofset.append(None)
                    continue
                dk = saat_dk(s)
                o = ofset
                if son is not None and dk + 1440 * o < son:
                    o += 1
                son = dk + 1440 * o
                gun_ofset.append(o)
            for i in range(len(duraklar)):
                for j in range(i + 1, len(duraklar)):
                    a, b = duraklar[i], duraklar[j]
                    if saatler[i] is None or saatler[j] is None:
                        continue
                    if not ((a in ADALAR and (b in ADALAR or b in ILGILI)) or (b in ADALAR and a in ILGILI)):
                        continue
                    g = list(gunler)
                    if yildiz_kurali and (yildizli[i] or yildizli[j]):
                        g = HAFTA_ICI_CT
                    seferler.append(kayit("Şehir Hatları", a, b, hh_mm_24(saatler[i], gun_ofset[i]),
                                          hh_mm_24(saatler[j], gun_ofset[j]), g, "", kaynak,
                                          ara_durak=[duraklar[m] for m in range(i + 1, j) if saatler[m]]))
    return tekille(seferler)


# ---------- Mavi Marmara ----------

def _tr_buyuk(s):
    return s.replace("i", "İ").replace("ı", "I").upper()


def mm_ara_durak(not_, kalkis_iskele, varis_iskele):
    """Guzergah notundan (orn. 'HEYBELİADA - BÜYÜKADA') varistan ONCE gelen iskeleler.
    Varis notta varsa ondan oncekiler; yoksa (orn. 'HEYBELİADA') kalkis/varis disindaki iskeleler.
    'DİREKT ...' ve bos not -> []."""
    n = _tr_buyuk(not_ or "")
    if not n.strip() or n.startswith("DİREKT"):
        return []
    kalk, var = _tr_buyuk(kalkis_iskele), _tr_buyuk(varis_iskele)
    parcalar = [p.strip() for p in n.split(" - ") if p.strip()]
    if var in parcalar:
        parcalar = parcalar[:parcalar.index(var)]
    return [_iskele_adi(p) for p in parcalar if p != kalk]


_ISKELE_ADLARI = {_tr_buyuk(a): a for a in ("Heybeliada", "Büyükada", "Burgazada", "Kınalıada", "Bostancı",
                                            "Kabataş", "Maltepe", "Kartal", "Kadıköy")}


def _iskele_adi(p):
    return _ISKELE_ADLARI.get(p, p.capitalize())


def mm_heybeli_turet(seferler):
    """Buyukada->Bostanci ve Bostanci->Buyukada seferlerinden Heybeliada'ya ugrayanlar icin ayrica
    Buyukada->Heybeliada (Buyukada kalkisli) ve Bostanci->Heybeliada (Bostanci kalkisli) kaydi turetir
    (varis saati bilinmez -> None). Idempotent; ara_durakta Heybeliada olmayana dokunmaz."""
    var = {(s["firma"], s["kalkis_iskele"], s["varis_iskele"], s["kalkis"], s["kaynak"]) for s in seferler}
    cikti = list(seferler)
    for s in seferler:
        if s["firma"] != "Mavi Marmara" or "Heybeliada" not in s.get("ara_durak", ()):
            continue
        if (s["kalkis_iskele"], s["varis_iskele"]) == (ADA, "Bostancı"):
            kal, not_ = ADA, "Bostancı seferi"
        elif (s["kalkis_iskele"], s["varis_iskele"]) == ("Bostancı", ADA):
            kal, not_ = "Bostancı", "Büyükada seferi"
        else:
            continue
        k = (s["firma"], kal, "Heybeliada", s["kalkis"], s["kaynak"])
        if k in var:
            continue
        var.add(k)
        cikti.append(kayit(s["firma"], kal, "Heybeliada", s["kalkis"], None, s["gunler"],
                           not_=not_, kaynak=s["kaynak"], ara_durak=[]))
    return cikti


def mavimarmara(url, kalkis_iskele, varis_iskele, kaynak="mavimarmara"):
    soup = BeautifulSoup(indir(url).text, "html.parser")
    tablo = soup.find("table")
    if tablo is None:
        raise ValueError("tablo bulunamadi (Cloudflare engeli olabilir)")
    seferler = []
    for satir in tablo.find_all("tr"):
        h = [c.get_text(" ", strip=True) for c in satir.find_all(["td", "th"])]
        if len(h) < 2 or not SAAT_RE.search(h[0]):
            continue
        yildizli = "*" in h[0]
        kalkis = hh_mm(h[0])
        # 2. sutun ya varis saati (Kabataş sayfalari) ya da guzergah metni (Bostancı sayfalari)
        if re.fullmatch(r"\d{1,2}:\d{2}", h[1]):
            varis, not_ = hh_mm(h[1]), ""
        else:
            varis, not_ = None, h[1]
        seferler.append(kayit("Mavi Marmara", kalkis_iskele, varis_iskele, kalkis, varis,
                              HAFTA_ICI_CT if yildizli else HEPSI, not_, kaynak,
                              ara_durak=mm_ara_durak(not_, kalkis_iskele, varis_iskele)))
    return mm_heybeli_turet(tekille(seferler))


# ---------- Prenstur ----------

def prenstur_json():
    return json.loads((VERI / "prenstur.json").read_text(encoding="utf-8"))


def prenstur_seferler(kaynak="prenstur"):
    """data/prenstur.json'daki elle girilmis tarifeyi sefer kayitlarina cevirir."""
    veri = prenstur_json()
    seferler = []

    def satirlar(liste):
        for ham in liste:
            yildizli = ham.startswith("*")
            a, b, c = ham.lstrip("*").split("/")
            yield HAFTA_ICI_CT_PRENSTUR if yildizli else HEPSI, a, b, c

    # Kartal kalkis / Büyükada varis / Heybeliada varis
    for g, kartal, ada, hey in satirlar(veri["kartal_heybeliada"]):
        seferler.append(kayit("Prenstur", "Kartal", ADA, kartal, ada, g, "", kaynak))
        seferler.append(kayit("Prenstur", ADA, "Heybeliada", ada, hey, g, "", kaynak))
        seferler.append(kayit("Prenstur", "Kartal", "Heybeliada", kartal, hey, g, "", kaynak, ara_durak=[ADA]))
    # Heybeliada kalkis / Büyükada kalkis / Kartal varis
    for g, hey, ada, kartal in satirlar(veri["heybeliada_kartal"]):
        seferler.append(kayit("Prenstur", "Heybeliada", ADA, hey, None, g, "", kaynak))
        seferler.append(kayit("Prenstur", ADA, "Kartal", ada, kartal, g, "", kaynak))
        seferler.append(kayit("Prenstur", "Heybeliada", "Kartal", hey, kartal, g, "", kaynak, ara_durak=[ADA]))
    return tekille(seferler)


# yildizli Prenstur seferleri hafta sonu (Cumartesi+Pazar) ve tatilde yok -> yalniz hafta ici
HAFTA_ICI_CT_PRENSTUR = ["hafta_ici"]


def prenstur_kontrol():
    """Prenstur sayfasindaki tarife resmi degistiyse hata metni, degismediyse None doner."""
    veri = prenstur_json()
    html = indir(PRENSTUR_SAYFA).text
    resimler = re.findall(r'src="([^"]*tarife[^"]*\.jpe?g)"', html, re.I)
    if not resimler:
        return "Prenstur tarife resmi sayfada bulunamadı (sayfa yapısı değişmiş olabilir)"
    ad = resimler[0].split("/")[-1]
    if ad != veri["gorsel"]:
        return f"Prenstur tarifesi değişti: resim adı {veri['gorsel']} -> {ad}"
    sha = hashlib.sha256(indir(PRENSTUR_TABAN + ad).content).hexdigest()
    if sha != veri["sha256"]:
        return f"Prenstur tarifesi değişti: {ad} aynı adla güncellenmiş (sha256 farklı)"
    return None


# ---------- Tatiller ----------

def tatiller(simdi):
    gunler = []
    for yil in (simdi.year, simdi.year + 1):
        for t in indir(TATIL_URL.format(yil=yil)).json():
            gunler.append(t["date"])
    return sorted(set(gunler))


# ---------- Ana akis ----------

def onceki_veri():
    try:
        return json.loads((VERI / "seferler.json").read_text(encoding="utf-8"))
    except Exception:
        return {}


def ozet_yaz(seferler):
    sayac = Counter((s["firma"], f'{s["kalkis_iskele"]} -> {s["varis_iskele"]}', s["yon"]) for s in seferler)
    print(f'{"firma":15} {"rota":28} {"yon":7} sayi')
    for (f, r, y), n in sorted(sayac.items()):
        print(f"{f:15} {r:28} {y:7} {n}")
    print("toplam:", len(seferler))


def main():
    simdi = datetime.now(ZoneInfo("Europe/Istanbul"))
    onceki = onceki_veri()
    onceki_seferler = onceki.get("seferler", [])
    hatalar = []        # genel hatalar (tatil vb.)
    cekilemeyen = []    # cekilemeyen tarife kaynaklari
    prenstur_degisti = []
    kaynaklar = {}
    tum = []

    isler = []  # (kaynak adi, url, fonksiyon)
    for ad, url in SH_SAYFALAR.items():
        isler.append((ad, url, lambda u=url, a=ad: sehirhatlari(u, a)))
    for ad, (yol, k, v) in MM_SAYFALAR.items():
        isler.append((ad, MM_TABAN + yol + "/", lambda u=MM_TABAN + yol + "/", k=k, v=v, a=ad: mavimarmara(u, k, v, a)))
    isler.append(("prenstur", PRENSTUR_SAYFA, prenstur_seferler))

    for ad, url, fonk in isler:
        try:
            yeni = fonk()
            if not yeni:
                raise ValueError("0 sefer döndü")
            kaynaklar[ad] = {"durum": "ok", "sefer": len(yeni), "url": url, "son_basari": simdi.isoformat(timespec="seconds")}
        except Exception as e:
            eski = [s for s in onceki_seferler if s.get("kaynak") == ad]
            yeni = eski
            # eski son_basari korunur (eski dosyada yoksa son_degisiklik en yakin tahmindir)
            eski_basari = (onceki.get("kaynaklar", {}).get(ad, {}).get("son_basari")
                           or onceki.get("son_degisiklik"))
            kaynaklar[ad] = {"durum": "hata", "hata": f"{type(e).__name__}: {e}", "sefer": len(eski), "url": url,
                             "son_basari": eski_basari, "not": "önceki veri kullanılıyor"}
            cekilemeyen.append(f"{ad}: {type(e).__name__}: {e} (önceki {len(eski)} sefer kullanıldı)")
        tum.extend(yeni)

    # Prenstur resim kontrolu
    try:
        degisim = prenstur_kontrol()
        if degisim:
            kaynaklar["prenstur"]["degisti"] = True
            kaynaklar["prenstur"]["uyari"] = degisim
            prenstur_degisti.append(degisim)
    except Exception as e:
        kaynaklar["prenstur"]["kontrol_hatasi"] = f"{type(e).__name__}: {e}"
        hatalar.append(f"prenstur kontrolü yapılamadı: {type(e).__name__}: {e}")

    # Tatiller
    try:
        tatil_listesi = tatiller(simdi)
        kaynaklar["tatiller"] = {"durum": "ok", "son_basari": simdi.isoformat(timespec="seconds"), "sefer": len(tatil_listesi), "url": TATIL_URL.format(yil=simdi.year)}
    except Exception as e:
        tatil_listesi = onceki.get("tatiller", [])
        kaynaklar["tatiller"] = {"durum": "hata", "son_basari": onceki.get("kaynaklar", {}).get("tatiller", {}).get("son_basari"), "hata": f"{type(e).__name__}: {e}", "sefer": len(tatil_listesi),
                                 "url": TATIL_URL.format(yil=simdi.year), "not": "önceki veri kullanılıyor"}
        hatalar.append(f"tatiller: {type(e).__name__}: {e}")

    tum.sort(key=lambda s: (s["firma"], s["kalkis_iskele"], s["varis_iskele"], s["kalkis"]))
    simdi_s = simdi.isoformat(timespec="seconds")
    icerik = {
        "notlar": {"Prenstur": prenstur_json().get("hafta_sonu_notu", "")},
        "seferler": tum,
        "tatiller": tatil_listesi,
    }
    # son_degisiklik: yalniz sefer verisi (son_kontrol/kaynak durumu haric) degistiyse yenilenir
    onceki_icerik = {k: onceki.get(k) for k in icerik}
    son_degisiklik = onceki.get("son_degisiklik") if onceki_icerik == icerik else simdi_s
    if not son_degisiklik:
        son_degisiklik = simdi_s
    cikti = {
        "son_kontrol": simdi_s,
        "son_degisiklik": son_degisiklik,
        "guncelleme": simdi_s,  # eski ad, son_kontrol ile ayni
        "kaynaklar": kaynaklar,
        **icerik,
    }
    VERI.mkdir(exist_ok=True)
    (VERI / "seferler.json").write_text(json.dumps(cikti, ensure_ascii=False, indent=1), encoding="utf-8")

    ozet_yaz(tum)
    hata_dosyasi = VERI / "hatalar.txt"
    govde = []
    if prenstur_degisti:
        govde.append("## PRENSTUR TARİFE RESMİ DEĞİŞTİ\n\n" + "\n".join(f"- **{d}**" for d in prenstur_degisti) +
                     "\n\n`data/prenstur.json` elle güncellenmeli (README: 'Prenstur tarifesi değişince').")
    if cekilemeyen or hatalar:
        govde.append("## Çekilemeyen kaynaklar\n\n" + "\n".join(f"- {h}" for h in cekilemeyen + hatalar) +
                     "\n\nEski veri korunuyor. Yerelden güncellemek için: `./guncelle.sh`")
    print("\nCekilemeyen:", cekilemeyen or "yok", "| Prenstur degisti:", bool(prenstur_degisti))
    if govde:
        hata_dosyasi.write_text("\n\n".join(govde) + "\n", encoding="utf-8")
        sys.exit(1)
    hata_dosyasi.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
