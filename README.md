# Seyrüsefer

Adalar'a (Kınalıada, Burgazada, Heybeliada, Büyükada) vapur ve motor seferlerini tek listede gösteren küçük, ticari olmayan bir web sitesi (PWA). Şehir Hatları, Mavi Marmara ve Prenstur seferlerini birleştirir. Sayfanın en üstündeki şeritten hedef ada seçilir (seçim hatırlanır, varsayılan Büyükada); iki sekme vardır: **Adadan çıkış** ve **Adaya gidiş** (seçili adaya göre, adalar arası seferler de dahil). iPhone'da Safari > Paylaş > Ana Ekrana Ekle ile uygulama gibi açılır.

Resmi değildir; sefer öncesi firmayı kontrol edin.

## Nasıl çalışır

- `scraper/topla.py` tarifeleri çeker ve `data/seferler.json` üretir (GitHub Actions haftada bir: Çarşamba 03:00 TR).
- Ön yüz (`index.html`, `app.js`, `style.css`) çerçevesiz statik dosyalardır; saat hesabı cihazda, İstanbul saatine göre yapılır.
- Bir kaynak çekilemezse veya 0 sefer dönerse o kaynağın eski seferleri korunur, `data/hatalar.txt` yazılır ve Actions bir GitHub Issue açar.
- Resmi tatiller https://date.nager.at üzerinden alınır; tatil günleri Pazar gibi sayılır.
- `data/seferler.json`: her kayıt bir (kalkış, varış) çiftidir; bir ucu ada, öteki ucu ada ya da kara iskelesidir (Maltepe, Bostancı, Kartal, Kadıköy, Kabataş). Yön (adadan/adaya) uygulamada seçili adaya göre hesaplanır; `yon` alanı yalnız uyumluluk içindir (Büyükada'ya göre, adalar arası seferde `adalar_arasi`). Mavi Marmara'nın Büyükada/Bostancı sayfalarından Heybeliada kayıtları, Prenstur'dan Kartal↔Heybeliada kayıtları (ara durak Büyükada) türetilir.
- `data/iskeleler.json`: iskele koordinatları ve en yakın otoparklar (OpenStreetMap, `scraper/iskeleler_uret.py` ile üretilir). Yol tarifi düğmesi Google Maps'i açar.

## Kaynaklar

1. Şehir Hatları: https://sehirhatlari.istanbul/tr/seferler/ic-hatlar/adalar-hatlari/
2. Mavi Marmara: https://mavimarmara.net/tarifeler/
3. Prenstur (Kartal): https://www.prenstur.net/index3e95.html?option=com_content&view=article&id=75&Itemid=477 (tarife yalnız resim)

Proje ticari değildir; kaynak sitelere seyrek (haftada 1 çalıştırma, birkaç istek) erişir.

## Haftalık akış ve 60 gün kuralı

1. Workflow (`.github/workflows/topla.yml`) her Çarşamba 03:00 TR'de (`0 0 * * 3`, 00:00 UTC) çalışır.
2. **403 notu:** Şehir Hatları ve Mavi Marmara GitHub Actions IP'lerinden 403 döndürüyor (beklenen durum). Prenstur kontrolü ve tatil listesi Actions'ta çalışır. Çekilemeyen kaynakların eski verisi korunur.
3. Çekilemeyen kaynak (veya Prenstur resim değişikliği) varsa Actions **"Haftalık tarife güncellemesi: ./guncelle.sh çalıştır"** başlıklı bir Issue açar (zaten açık biri varsa yenisini açmaz). GitHub bunu e-postayla bildirir.
4. MacBook'ta tek komut: `./guncelle.sh`. Betik `git pull --rebase` yapar, gerekirse `.venv` kurar, `scraper/topla.py`'yi çalıştırıp özet tabloyu gösterir, `data/` değiştiyse "Veri guncellendi (yerel)" diye commit + push eder, her şey başarılıysa açık hatırlatma Issue'sunu kapatır ve site adresini yazar. Bir kaynak yerelden de çekilemezse açıkça uyarır; başarılı olanlar yine kaydedilir.
5. Elle tetiklemek için: GitHub'da **Actions > Seferleri topla > Run workflow**.
6. `data/seferler.json` içinde her kaynağın `son_basari` zamanı tutulur (çekim başarısızsa eski değer korunur). `son_kontrol` her çalışmada, `son_degisiklik` yalnızca sefer verisi değiştiyse güncellenir. Her hafta commit atılması bilerek böyledir: GitHub, 60 gün hareketsiz repoda zamanlanmış iş akışlarını kapatır.
7. Arayüz başlık altında "Tarifeler: <en eski başarılı çekim> · Tarife değişikliği: <tarih>" gösterir. En eski başarılı çekim 14 günden eskiyse turuncu "Tarifeler güncel olmayabilir" uyarısı çıkar; kaynak bazlı "eski veri" notu da yalnız o kaynak 14 günden eskiyse görünür. Tek seferlik 403'ler kullanıcıya uyarı olarak yansımaz.

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
