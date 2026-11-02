"""Büyükada vapur/motor seferlerini toplayip data/seferler.json uretir.

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

ADA = "Büyükada"
ILGILI = {"Maltepe", "Bostancı", "Kartal", "Kadıköy", "Kabataş", "Heybeliada"}
HEPSI = ["hafta_ici", "cumartesi", "pazar"]
HAFTA_ICI_CT = ["hafta_ici", "cumartesi"]
# gece yarisindan sonra kalan seferin ait oldugu takvim gunu (onceki gun tipine gore)
SONRAKI_GUN = {"hafta_ici": ["hafta_ici", "cumartesi"], "cumartesi": ["pazar"], "pazar": ["hafta_ici"]}

SAAT_RE = re.compile(r"(\d{1,2}):(\d{2})")


def indir(url, **kw):
    r = requests.get(url, headers={"User-Agent": UA}, timeout=30, **kw)
    r.raise_for_status()
    return r


def saat_dk(s):
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def hh_mm(s):
    m = SAAT_RE.search(s)
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None


def kayit(firma, kalkis_iskele, varis_iskele, kalkis, varis, gunler, not_="", kaynak=""):
    yon = "adadan" if kalkis_iskele == ADA else "adaya"
    return {"firma": firma, "kalkis_iskele": kalkis_iskele, "varis_iskele": varis_iskele,
            "kalkis": kalkis, "varis": varis, "gunler": list(gunler), "yon": yon,
            "not": not_, "kaynak": kaynak}


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
            # satirlar kronolojik: ilk saat geriye giderse gece yarisi gecilmistir
            if onceki_ilk is not None and ilk < onceki_ilk:
                ofset = 1
            onceki_ilk = ilk
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
                    if not ((a == ADA and b in ILGILI) or (b == ADA and a in ILGILI)):
                        continue
                    g = list(gunler)
                    if yildiz_kurali and (yildizli[i] or yildizli[j]):
                        g = HAFTA_ICI_CT
                    if gun_ofset[i] >= 1:
                        g = sorted({x for d in g for x in SONRAKI_GUN[d]}, key=HEPSI.index)
                    seferler.append(kayit("Şehir Hatları", a, b, saatler[i], saatler[j], g, "", kaynak))
    return tekille(seferler)


# ---------- Mavi Marmara ----------

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
                              HAFTA_ICI_CT if yildizli else HEPSI, not_, kaynak))
    return tekille(seferler)


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
    # Heybeliada kalkis / Büyükada kalkis / Kartal varis
    for g, hey, ada, kartal in satirlar(veri["heybeliada_kartal"]):
        seferler.append(kayit("Prenstur", "Heybeliada", ADA, hey, None, g, "", kaynak))
        seferler.append(kayit("Prenstur", ADA, "Kartal", ada, kartal, g, "", kaynak))
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
    hatalar = []
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
            kaynaklar[ad] = {"durum": "ok", "sefer": len(yeni), "url": url}
        except Exception as e:
            eski = [s for s in onceki_seferler if s.get("kaynak") == ad]
            yeni = eski
            kaynaklar[ad] = {"durum": "hata", "hata": f"{type(e).__name__}: {e}", "sefer": len(eski), "url": url,
                             "not": "önceki veri kullanılıyor"}
            hatalar.append(f"{ad}: {type(e).__name__}: {e} (önceki {len(eski)} sefer kullanıldı)")
        tum.extend(yeni)

    # Prenstur resim kontrolu
    try:
        degisim = prenstur_kontrol()
        if degisim:
            kaynaklar["prenstur"]["degisti"] = True
            kaynaklar["prenstur"]["uyari"] = degisim
            hatalar.append(degisim)
    except Exception as e:
        kaynaklar["prenstur"]["kontrol_hatasi"] = f"{type(e).__name__}: {e}"
        hatalar.append(f"prenstur kontrolü yapılamadı: {type(e).__name__}: {e}")

    # Tatiller
    try:
        tatil_listesi = tatiller(simdi)
        kaynaklar["tatiller"] = {"durum": "ok", "sefer": len(tatil_listesi), "url": TATIL_URL.format(yil=simdi.year)}
    except Exception as e:
        tatil_listesi = onceki.get("tatiller", [])
        kaynaklar["tatiller"] = {"durum": "hata", "hata": f"{type(e).__name__}: {e}", "sefer": len(tatil_listesi),
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
    if hatalar:
        hata_dosyasi.write_text("\n".join(hatalar) + "\n", encoding="utf-8")
        print("\nHATALAR:\n" + "\n".join(hatalar), file=sys.stderr)
        sys.exit(1)
    hata_dosyasi.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
