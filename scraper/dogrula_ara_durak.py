"""data/seferler.json ara_durak dogrulamasi: python scraper/dogrula_ara_durak.py"""
import json, sys
from collections import Counter
from pathlib import Path
d = json.loads((Path(__file__).resolve().parent.parent / "data/seferler.json").read_text(encoding="utf-8"))["seferler"]
assert all("ara_durak" in s for s in d), "ara_durak eksik kayit var"
def bul(f, k, v, t):
    return [s for s in d if s["firma"] == f and s["kalkis_iskele"] == k and s["varis_iskele"] == v and s["kalkis"] == t]
for t in ("02:00", "15:10", "21:45", "07:45"):
    for s in bul("Şehir Hatları", "Bostancı", "Büyükada", t):
        print(t, "->", s["varis"], s["ara_durak"])
        if t != "07:45": assert s["ara_durak"], t
assert bul("Şehir Hatları", "Bostancı", "Büyükada", "02:00")[0]["ara_durak"] == ["Kınalıada", "Burgazada", "Heybeliada"]
assert all(s["ara_durak"] == [] for s in d if s["firma"] == "Şehir Hatları" and s["kalkis_iskele"] == "Heybeliada" and s["varis_iskele"] == "Büyükada" and s["kalkis"] == "08:35")
for k, n in sorted(Counter((s["firma"], s["kalkis_iskele"], s["varis_iskele"], s["not"], tuple(s["ara_durak"])) for s in d if s["ara_durak"] or s["firma"] == "Mavi Marmara").items()):
    print(n, k)
print("toplam", len(d), "ara_durakli", sum(1 for s in d if s["ara_durak"]))
