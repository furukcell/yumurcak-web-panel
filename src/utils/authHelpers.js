import { ref, get, set } from 'firebase/database';
import { database } from '../config/firebase';

// Mobil uygulamadaki authHelpers.js'den birebir taşındı — Firebase Auth
// UID'sini kullanicilar/{id} kaydına bağlayan index. authKullaniciIndex'te
// yoksa (nadiren) tüm kullanicilar taranarak authUid alanına göre aranır.
export async function findUserIdByAuthUid(authUid) {
  if (!authUid) return null;

  const indexSnap = await get(ref(database, `authKullaniciIndex/${authUid}`));
  if (indexSnap.exists()) return indexSnap.val();

  const usersSnap = await get(ref(database, 'kullanicilar'));
  const users = usersSnap.val() || {};
  const found = Object.entries(users).find(([, user]) => user?.authUid === authUid);

  if (found) {
    const [foundUserId] = found;
    set(ref(database, `authKullaniciIndex/${authUid}`), foundUserId).catch(() => {});
    return foundUserId;
  }

  return null;
}

export async function getKresForUser(userData) {
  if (!userData?.kresId) return null;
  const kresSnap = await get(ref(database, `kresler/${userData.kresId}`));
  if (!kresSnap.exists()) return null;
  return { id: userData.kresId, ...kresSnap.val() };
}
