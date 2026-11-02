#!/usr/bin/env bash
# Haftalık tarife güncellemesi (MacBook'tan tek komut): ./guncelle.sh
# Şehir Hatları ve Mavi Marmara GitHub IP'lerinden 403 veriyor; bu yüzden yerelden çekilir.
set -u
cd "$(dirname "$0")"

git pull --rebase || { echo "git pull başarısız, durduruldu."; exit 1; }

if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q requests beautifulsoup4
fi

.venv/bin/python scraper/topla.py
KOD=$?
if [ $KOD -ne 0 ]; then
  echo
  echo "UYARI: bazı kaynaklar yerelden de çekilemedi veya Prenstur tarifesi değişti (aşağıdaki dosya)."
  echo "Başarılı olanlar yine de kaydedilecek, eskileri korunuyor."
  [ -f data/hatalar.txt ] && cat data/hatalar.txt
fi

git add data/
if git diff --cached --quiet; then
  echo "data/ değişmedi, commit yok."
else
  git commit -q -m "Veri guncellendi (yerel)" && git push || echo "UYARI: push başarısız."
fi

# Hepsi başarılıysa açık hatırlatma issue'sunu kapat
if [ $KOD -eq 0 ] && command -v gh >/dev/null 2>&1; then
  for N in $(gh issue list --state open --search '"Haftalık tarife güncellemesi" in:title' --json number --jq '.[].number'); do
    gh issue close "$N" --comment "./guncelle.sh ile güncellendi." && echo "Issue #$N kapatıldı."
  done
fi

echo
echo "Site: https://dinjon4.github.io/ada-ulasim/"
