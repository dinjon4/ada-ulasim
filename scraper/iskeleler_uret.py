"""data/iskeleler.json dosyasini OpenStreetMap (Overpass) verisinden uretir.

Nadiren calistirilir (iskele tasinirsa vb.). Koordinat UYDURMAZ: her nokta bir OSM ogesinden gelir.
Kullanim: python scraper/iskeleler_uret.py
"""
import json
import math
import time
from pathlib import Path

import requests

HEDEF = Path(__file__).resolve().parent.parent / "data" / "iskeleler.json"
URLS = ["https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.private.coffee/api/interpreter"]

# iskele -> firma -> (OSM turu, id, aciklama, belirsiz mi, not)
NOKTALAR = {
    "Büyükada": {"kara": False, "firmalar": {
        "Şehir Hatları": ("node", 4040637476, "Büyükada (Adalar) vapur iskelesi", False,
                          "OSM'de Şehir Hatları Kabataş-Adalar hattının durağı"),
        "Mavi Marmara": ("way", 700032115, "Büyükada motor iskelesi (Mavi Marmara)", True,
                         "OSM'de 'Mavi Marmara İskelesi'; tam yeri doğrulanmadı"),
        "Prenstur": ("way", 700032115, "Büyükada motor iskelesi", True,
                     "Prenstur'un Büyükada iskelesi OSM'de ayrı işaretli değil; motor iskelesi varsayıldı"),
    }},
    "Heybeliada": {"kara": False, "firmalar": {
        "Şehir Hatları": ("node", 10288058480, "Heybeliada vapur iskelesi", False,
                          "OSM'de Şehir Hatları Kabataş-Adalar hattının durağı"),
        "Prenstur": ("way", 402967664, "Heybeliada motor iskelesi (Prenstur)", False,
                     "OSM'de operator=Prenstur"),
    }},
    "Maltepe": {"kara": True, "firmalar": {
        "Şehir Hatları": ("way", 264038066, "Maltepe vapur iskelesi", False, ""),
    }},
    "Bostancı": {"kara": True, "firmalar": {
        "Şehir Hatları": ("way", 404524230, "Bostancı vapur iskelesi", False, "OSM operator=Şehir Hatları"),
        "Mavi Marmara": ("way", 404524231, "Bostancı motor iskelesi", False, "OSM operator=Mavi Marmara"),
    }},
    "Kartal": {"kara": True, "firmalar": {
        "Prenstur": ("node", 10151469222, "Kartal - Adalar iskelesi", True,
                     "OSM'de 'Kartal - Adalar İskelesi' (shelter); Prenstur'a özel işaret yok"),
    }},
    "Kadıköy": {"kara": True, "firmalar": {
        "Şehir Hatları": ("node", 583523020, "Kadıköy iskelesi (Adalar hattı durağı)", False,
                          "OSM'de Şehir Hatları Kabataş-Adalar hattının Kadıköy durağı"),
    }},
    "Kabataş": {"kara": True, "firmalar": {
        "Şehir Hatları": ("way", 1383311663, "Kabataş iskelesi", False, "OSM wikipedia=tr:Kabataş İskelesi"),
        "Mavi Marmara": ("way", 225470894, "Kabataş - Kadıköy motor iskelesi", True,
                         "Mavi Marmara'nın Kabataş iskelesi OSM'de ayrı işaretli değil; motor iskelesi varsayıldı"),
    }},
}


# Elle verilen (Google Maps) otoparklar: OSM verisinin yerine gecer ve yeniden uretimde ezilmez.
ELLE_OTOPARK = {
    "Kadıköy": ("İSPARK Kadıköy Metro Açık Otoparkı", 40.9895293, 29.020949),
    "Bostancı": ("İSPARK Bostancı Açık Otoparkı", 40.9523453, 29.0902652),
    "Maltepe": ("İSPARK Maltepe Sahil Dolgu Alanı Otoparkı", 40.9198163, 29.1261888),
    "Kartal": ("İSPARK Kartal Sahil Açık Otoparkı", 40.8873357, 29.1902295),
    "Kabataş": ("İSPARK Kabataş Transfer Merkezi Otoparkı", 41.0335752, 28.9923408,
                {"ucret": "ücretli (ilk 20 dk ücretsiz)", "tur": "underground", "kapasite": 160,
                 "kaynak": "ispark.istanbul"}),
}


def elle_otopark(iskele, lat, lng):
    if iskele not in ELLE_OTOPARK:
        return None
    ad, la, lo, *ek = ELLE_OTOPARK[iskele]
    kayit = {"ad": ad, "lat": la, "lng": lo, "mesafe_m": round(mesafe_m((lat, lng), (la, lo))),
             "isletmeci": "İSPARK", "ucret": "ücretli", "kaynak": "kullanıcı (Google Maps)", "elle": True}
    if ek:
        kayit.update(ek[0])
    return [kayit]


def overpass(q):
    for _ in range(4):
        for u in URLS:
            try:
                r = requests.post(u, data={"data": q}, timeout=40,
                                  headers={"User-Agent": "AdaUlasim/1.0 (yerel gelistirme)"})
                if r.status_code == 200:
                    return r.json()["elements"]
            except Exception:
                pass
        time.sleep(10)
    raise SystemExit("Overpass erisilemedi")


def merkez(e):
    c = e.get("center") or e
    return c["lat"], c["lon"]


def mesafe_m(a, b):
    r = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def otoparklar(adaylar_ham, lat, lng, adet=2):
    """Onceden cekilmis otopark ogeleri arasindan iskeleye en yakin 800 m icindekileri secer."""
    adaylar = []
    for e in adaylar_ham:
        t = e.get("tags", {})
        if t.get("parking", "surface") not in ("surface", "multi-storey", "underground"):
            continue  # sokak kenari vb. elenir (etiketsiz park alanlari 'surface' sayilir)
        if t.get("access") in ("private", "customers", "permit", "no", "delivery"):
            continue
        ll = merkez(e)
        d = mesafe_m((lat, lng), ll)
        if d <= 800:
            adaylar.append((d, e, ll))
    adaylar.sort(key=lambda x: x[0])
    sonuc = []
    for d, e, ll in adaylar[:adet]:
        t = e["tags"]
        ucret = {"yes": "ücretli", "no": "ücretsiz"}.get(t.get("fee"))
        sonuc.append({
            "ad": t.get("name") or t.get("operator") or "Otopark (adsız)",
            "lat": round(ll[0], 6), "lng": round(ll[1], 6), "mesafe_m": round(d),
            "isletmeci": t.get("operator"), "ucret": ucret, "tur": t.get("parking"),
            "kapasite": t.get("capacity"),
            "osm": f'{e["type"]}/{e["id"]}',
        })
    return sonuc


def main():
    # 1) tum iskele ogeleri tek sorguda
    kimlikler = {(tur, oid) for b in NOKTALAR.values() for (tur, oid, *_r) in b["firmalar"].values()}
    q = "[out:json][timeout:60];(" + "".join(f"{t}({i});" for t, i in sorted(kimlikler)) + ");out center tags;"
    ogeler = {(e["type"], e["id"]): e for e in overpass(q)}
    time.sleep(3)
    # 2) kara iskeleleri cevresindeki otoparklar tek sorguda (birlesik kutu)
    kara = [merkez(ogeler[(t, i)]) for b in NOKTALAR.values() if b["kara"] for (t, i, *_r) in b["firmalar"].values()]
    kutular = "".join(f'nwr["amenity"="parking"](around:900,{la},{lo});' for la, lo in kara)
    park = overpass("[out:json][timeout:90];(" + kutular + ");out center tags;")
    cikti = {"kaynak": "OpenStreetMap (c) katkıda bulunanlar, ODbL", "iskeleler": {}}
    for ad, bilgi in NOKTALAR.items():
        noktalar = {}
        for firma, (tur, oid, aciklama, belirsiz, not_) in bilgi["firmalar"].items():
            el = ogeler[(tur, oid)]
            lat, lng = merkez(el)
            otopark = elle_otopark(ad, lat, lng) or (
                (otoparklar(park, lat, lng) or None) if bilgi["kara"] else None)
            noktalar[firma] = {
                "ad": aciklama, "lat": round(lat, 6), "lng": round(lng, 6),
                "osm": f"{tur}/{oid}", "osm_adi": el.get("tags", {}).get("name"),
                "belirsiz": belirsiz, "not": not_, "otopark": otopark,
            }
            print(ad, firma, lat, lng, "otopark:", [(o["ad"], o["mesafe_m"]) for o in (otopark or [])])
        cikti["iskeleler"][ad] = {"kara": bilgi["kara"], "noktalar": noktalar}
    HEDEF.write_text(json.dumps(cikti, ensure_ascii=False, indent=1), encoding="utf-8")


def elle_uygula():
    """Mevcut iskeleler.json'a yalniz elle otoparklari uygular (Overpass'a gitmez)."""
    veri = json.loads(HEDEF.read_text(encoding="utf-8"))
    for ad, i in veri["iskeleler"].items():
        for n in i["noktalar"].values():
            e = elle_otopark(ad, n["lat"], n["lng"])
            if e:
                n["otopark"] = e
    HEDEF.write_text(json.dumps(veri, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    import sys
    elle_uygula() if "--elle" in sys.argv else main()
