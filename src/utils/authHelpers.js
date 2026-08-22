import { ref, get, set } from 'firebase/database';
import { database } from '../config/firebase';

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

export function usernameToEmail(username) {
  const clean = normalizeUsername(username);
  if (clean.includes('@')) return clean;
  const safe = clean
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9._-]/g, '');
  return `${safe || 'kullanici'}@yumurcak.local`;
}


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
