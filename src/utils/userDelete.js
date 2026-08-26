import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

// functions/index.js'deki deleteKullanici callable fonksiyonunu çağırır.
// Hem kullanicilar/{id} kaydını ve tüm index'lerini (authKullaniciIndex,
// kullaniciAdiIndex, kresKullanicilari, sınıf/veli bağlantıları vb.) hem de
// gerçek Firebase Auth hesabını siler — client SDK başkasının Auth
// hesabını silemediği için bu iş Cloud Function'a devredildi.
export async function deleteKullaniciHesabi(id) {
  const callable = httpsCallable(functions, 'deleteKullanici');
  await callable({ id });
}
