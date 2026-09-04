import { ref, push } from 'firebase/database';
import { database } from '../config/firebase';

// Kurum içindeki önemli işlemleri (ekleme/güncelleme/silme) denetimKayitlari/{kresId}
// altına yazar. Birden fazla yönetici/öğretmen aynı paneli kullanıyorsa "kim ne
// yaptı" sorusuna cevap verir; KVKK açısından da veri işleme faaliyetlerinin
// izlenebilirliği ilkesine daha uygun hale getirir (bkz. AuditLogPage.jsx).
//
// NOT: Firebase güvenlik kurallarında denetimKayitlari/{kresId} altına
// yonetici rolünün kendi kresId'si için okuma/yazma izni tanımlı olmalı —
// bu repo (web panel) kuralları içermiyor, kurallar mobil repodaki
// database.rules.json'da. Kural eklenmeden bu özellik sessizce çalışmaz.
export async function denetimKaydiYaz({ kresId, kullanici, islem, modul, hedef, detay }) {
  if (!kresId) return;
  try {
    await push(ref(database, `denetimKayitlari/${kresId}`), {
      islem,        // 'ekle' | 'guncelle' | 'sil'
      modul,        // 'Çocuklar' | 'Öğretmenler' | 'Yöneticiler' | 'Ödemeler' ...
      hedef: hedef || '',
      detay: detay || '',
      yapanAd: `${kullanici?.ad || ''} ${kullanici?.soyad || ''}`.trim() || kullanici?.kullaniciAdi || kullanici?.email || 'Bilinmeyen kullanıcı',
      yapanId: kullanici?.uid || kullanici?.id || '',
      tarih: Date.now(),
    });
  } catch (error) {
    // Denetim kaydı başarısız olsa bile asıl işlemi (çocuk/öğretmen kaydetme vb.)
    // bloklamamalı — sadece uyarı logla.
    console.warn('Denetim kaydı yazılamadı:', error);
  }
}
