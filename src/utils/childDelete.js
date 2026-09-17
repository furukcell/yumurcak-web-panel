import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

// functions/index.js'deki deleteCocuk callable fonksiyonunu çağırır.
// cocuklar/{id} kaydını ve tüm index/rapor bağlantılarını (kresCocuklari,
// sinifCocuklari, veliCocuklari, gunlukRaporlar, fizikselGelisim, yoklamalar,
// uyumKayitlari, haftaninRozetleri, ilacTakipFormlari, gunlukYorumlar, galeri
// etiketleri vb.) siler. Sadece durum === 'ayrildi' olan çocuklar için çalışır.
export async function deleteCocukKaydi(id) {
  const callable = httpsCallable(functions, 'deleteCocuk');
  await callable({ id });
}
