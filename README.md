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

Panel, mobil uygulamadaki admin hesabıyla (aynı email/şifre) giriş
yapıyor. `kullanicilar` kaydında `rol: 'admin'` olmayan hesaplar panele
giremiyor.
