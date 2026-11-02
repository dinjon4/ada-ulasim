# Ada Vapur

Büyükada vapur ve motor seferlerini tek listede gösteren küçük, ticari olmayan bir web sitesi (PWA). Şehir Hatları, Mavi Marmara ve Prenstur seferlerini birleştirir; iki sekme vardır: **Adadan çıkış** ve **Adaya dönüş**. iPhone'da Safari > Paylaş > Ana Ekrana Ekle ile uygulama gibi açılır.

Resmi değildir; sefer öncesi firmayı kontrol edin.

## Nasıl çalışır

- `scraper/topla.py` tarifeleri çeker ve `data/seferler.json` üretir (GitHub Actions haftada bir: Çarşamba 03:00 TR).
- Ön yüz (`index.html`, `app.js`, `style.css`) çerçevesiz statik dosyalardır; saat hesabı cihazda, İstanbul saatine göre yapılır.
- Bir kaynak çekilemezse veya 0 sefer dönerse o kaynağın eski seferleri korunur, `data/hatalar.txt` yazılır ve Actions bir GitHub Issue açar.
- Resmi tatiller https://date.nager.at üzerinden alınır; tatil günleri Pazar gibi sayılır.
- `data/iskeleler.json`: iskele koordinatları ve en yakın otoparklar (OpenStreetMap, `scraper/iskeleler_uret.py` ile üretilir). Yol tarifi düğmesi Google Maps'i açar.

## Kaynaklar

1. Şehir Hatları: https://sehirhatlari.istanbul/tr/seferler/ic-hatlar/adalar-hatlari/
2. Mavi Marmara: https://mavimarmara.net/tarifeler/
3. Prenstur (Kartal): https://www.prenstur.net/index3e95.html?option=com_content&view=article&id=75&Itemid=477 (tarife yalnız resim)

Proje ticari değildir; kaynak sitelere seyrek (haftada 1 çalıştırma, birkaç istek) erişir.

## Haftalık güncelleme ve 60 gün kuralı

- Workflow (`.github/workflows/topla.yml`) her Çarşamba 03:00 TR'de (`0 0 * * 3`, 00:00 UTC) çalışır.
- `data/seferler.json` içinde `son_kontrol` her çalışmada güncellenir, `son_degisiklik` yalnızca sefer verisi gerçekten değiştiyse. Bu yüzden her hafta bir commit atılır. Bu bilerek böyledir: GitHub, 60 gün hareketsiz kalan depolarda zamanlanmış iş akışlarını kapatır; haftalık commit bunu engeller.
- Elle tetiklemek için: GitHub'da **Actions > Seferleri topla > Run workflow**.
- Arayüz başlığın altında "Son kontrol / Tarife değişikliği" satırını gösterir; son kontrol 10 günden eskiyse "Veriler güncel olmayabilir" uyarısı çıkar.

## Prenstur tarifesi değişince

Prenstur tarifesi yalnızca JPEG resim olduğundan saatler `data/prenstur.json` içine elle yazılır. Resim adı ya da içeriği (sha256) değişirse toplayıcı "Prenstur tarifesi değişti" hatası verir ve Issue açılır. Güncelleme:

1. Sayfadaki yeni resmi açın, saatleri okuyun.
2. `data/prenstur.json` içinde `kartal_heybeliada` (Kartal kalkış / Büyükada varış / Heybeliada varış) ve `heybeliada_kartal` (Heybeliada kalkış / Büyükada kalkış / Kartal varış) listelerini güncelleyin. Satır biçimi `ÖN/ORTA/SON`; baştaki `*` hafta sonu ve tatilde yapılmayan seferdir.
3. `gorsel` alanına yeni dosya adını yazın; `sha256` için: `curl -s https://www.prenstur.net/<dosya> | shasum -a 256`
4. `hafta_sonu_notu` metni değiştiyse onu da güncelleyin.
5. `python scraper/topla.py` çalıştırıp sonucu kontrol edin, commit edin.

## Yerelde çalıştırma

```
python3 -m venv .venv && .venv/bin/pip install requests beautifulsoup4
.venv/bin/python scraper/topla.py
python3 -m http.server 8765    # http://localhost:8765
```

## Test parametresi

Sayfa adresine `?t=YYYY-MM-DDTHH:MM` eklenirse "şimdi" bu İstanbul yerel saati olur, örneğin `?t=2026-11-08T21:30` (Pazar gecesi) veya `?t=2026-11-09T14:07`.
