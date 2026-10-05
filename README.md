# Yumurcak — Web Yönetim Paneli

Faz planı için: `docs/web-panel-plan.md` (ana `yumurcak-app` reposunda).

## Bir Kerelik Kurulum

Bu adımlar sadece **ilk kurulumda bir kere** yapılır, sonrasında `main`
dalına her push'ta GitHub Actions otomatik build+deploy yapar.

### 1) Bu klasörü yeni bir GitHub reposuna yükle
- GitHub'da yeni, boş bir repo oluştur: `yumurcak-web-panel`
- Bu klasördeki tüm dosyaları (gizli `.github` klasörü dahil!) o repoya
  yükle — GitHub web arayüzünden "Add file → Upload files" ile klasörü
  sürükleyip bırakabilirsin.

### 2) Firebase servis hesabı anahtarı al
GitHub Actions'ın senin adına Firebase Hosting'e deploy yapabilmesi için
bir "servis hesabı" anahtarına ihtiyacı var:

1. https://console.firebase.google.com adresinde `yumurcak-app` projesini aç
2. ⚙️ Project Settings → Service Accounts sekmesi
3. "Generate new private key" butonuna bas → bir `.json` dosyası iner
4. Bu dosyanın **tüm içeriğini** kopyala (metin olarak)

### 3) Anahtarı GitHub'a gizli bilgi (secret) olarak ekle
1. `yumurcak-web-panel` reposunda: Settings → Secrets and variables → Actions
2. "New repository secret"
3. Name: `FIREBASE_SERVICE_ACCOUNT`
4. Value: az önce kopyaladığın JSON içeriğinin tamamı
5. Kaydet

### 4) İlk deploy
`main` dalına bir push yap (ör. bu README'yi kaydet) — GitHub Actions
sekmesinden ("Actions" tab) build'in çalıştığını görebilirsin. Bitince
panel şu adreste yayında olur: **https://yumurcak-app.web.app**

## Giriş

Panel, mobil uygulamadaki admin (yönetici) hesabıyla (aynı email/şifre)
giriş yapıyor. `kullanicilar` kaydında `rol: 'yonetici'` olmayan hesaplar
panele giremiyor.

## Yönetici Kendi Kendine Ödeme (Feature Flag)

Kurum yöneticisinin panelden fiyat/paket görmesi, ücretsiz deneme başlatması
ve promosyon kodu uygulaması **şu an kapalıdır** (kod silinmedi, gizlendi).
Ödemeler IBAN ile alınır; abonelik süper admin tarafından manuel tanımlanır.
Mobil uygulamadaki (`Yumurcak-app`) aynı flag ile birebir aynı mantıktır.

**Ayar dosyası:** `src/config/featureFlags.js`

```js
export const SELF_SERVICE_PAYMENT_ENABLED = false; // true: eski ekran geri gelir
export const SUPPORT_WHATSAPP = '';                // ülke kodlu, + ve boşluksuz
export const SUPPORT_EMAIL = '';                   // boşsa buton çıkmaz
```

| Durum | Yönetici `/ayarlar/abonelik` sayfasında ne görür |
| ----- | ------------------------------------------------ |
| `false` (şu an) | Abonelik durumu, kalan gün, öğrenci kullanımı ve "Abonelik ve Ödeme / iletişime geçin" kartı. Fiyat, paket, deneme ve promosyon yok. |
| `true` | Eski sayfa: bilgi kutusu, deneme butonu, promosyon kodu, paket ve fiyat kartları. |

### Tekrar aktif etme
1. `SELF_SERVICE_PAYMENT_ENABLED = true` yap.
2. Ana repodaki (`Yumurcak-app`) `database.rules.json` içinde yöneticinin
   `abonelikler` / `promosyon*` yazma yetkisi kapatıldıysa tekrar aç.
3. Mobil uygulamadaki flag'i de aynı şekilde aç (iki taraf tutarlı olsun).
4. Push'la, GitHub Actions deploy etsin.

## Ödeme Planı (Taksit) ve Aylık Özet

Veli ödemeleri `odemeler/{id}` altında **her çocuk için her ay ayrı kayıt** olarak
tutulur. Ödemeler sayfasında (`/odemeler`) yönetici:

- **Tek ay** yerine **Ödeme planı** seçerek tek seferde 1–12 aylık kayıt oluşturabilir.
  Her kayıtta `planId`, `taksitNo`, `taksitSayisi` alanları bulunur ve yazma tek toplu
  `update()` ile yapılır. Veliye 12 değil, tek bildirim gider.
- Planlı kayıtlarda **kalan** her zaman ödenmemiş kayıtlardan hesaplanır
  ("5/12 ödendi · kalan 7 ay · 14.000 ₺"); ayrı sayaç tutulmaz.
- **Seç** moduyla birden çok kaydı tek seferde "ödendi" yapabilir.
- **Plan** butonuyla kalan ayların tutarını değiştirebilir veya planı iptal edebilir
  (iptalde sadece ödenmemiş kayıtlar silinir, ödenenler kalır).
- Aylık özet: Beklenen / Tahsil edilen / Kalan seçili aya göre; Geciken ve Yaklaşan tüm
  aylar için hesaplanır. "Yaklaşan" = son ödemesine `UPCOMING_DAYS` (7) gün veya
  daha az kalan, ödenmemiş kayıtlar.

Mobil uygulamadaki (`Yumurcak-app`) `PaymentFormScreen` / `PaymentListScreen` ile aynı
veri modelini ve mantığı kullanır.
