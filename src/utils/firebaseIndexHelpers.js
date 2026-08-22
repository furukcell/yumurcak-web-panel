// Mobildeki src/utils/firebaseIndexHelpers.js'in web karşılığı.
import { ref, update } from 'firebase/database';
import { database } from '../config/firebase';
import { normalizeUsername } from './authHelpers';

export function getRoleIndexGroup(role) {
  switch (role) {
    case 'yonetici':
      return 'yoneticiler';
    case 'ogretmen':
      return 'ogretmenler';
    case 'veli':
      return 'veliler';
    case 'superadmin':
      return 'superadminler';
    default:
      return 'diger';
  }
}

export function addUserIndexUpdates(updates, userId, user = {}) {
  if (!updates || !userId || !user?.kresId) return updates;
  const group = getRoleIndexGroup(user.rol);
  updates[`kresKullanicilari/${user.kresId}/${group}/${userId}`] = true;
  updates[`kullaniciKresleri/${userId}/${user.kresId}`] = true;

  const rawUsername = user.kullaniciAdi ?? user.kullanici_adi ?? user.username ?? user.userName;
  if (rawUsername) {
    const cleanUsername = normalizeUsername(rawUsername);
    if (cleanUsername) updates[`kullaniciAdiIndex/${cleanUsername}`] = userId;
  }
  return updates;
}

export function addChildIndexUpdates(updates, childId, child = {}) {
  if (!updates || !childId) return updates;
  if (child.kresId) updates[`kresCocuklari/${child.kresId}/${childId}`] = true;
  if (child.sinifId) updates[`sinifCocuklari/${child.sinifId}/${childId}`] = true;

  const veliIds = Array.isArray(child.veliIds) ? child.veliIds : [];
  veliIds.forEach((veliId) => {
    if (veliId) updates[`veliCocuklari/${veliId}/${childId}`] = true;
  });
  return updates;
}

export function addClassIndexUpdates(updates, classId, sinif = {}) {
  if (!updates || !classId || !sinif?.kresId) return updates;
  updates[`kresSiniflari/${sinif.kresId}/${classId}`] = true;

  const ogretmenIds = Array.isArray(sinif.ogretmenIds) ? sinif.ogretmenIds : sinif.ogretmenId ? [sinif.ogretmenId] : [];
  ogretmenIds.forEach((ogretmenId) => {
    if (ogretmenId) updates[`ogretmenSiniflari/${ogretmenId}/${classId}`] = true;
  });
  return updates;
}

export function getConversationParticipantIds(conversation = {}) {
  const set = new Set();
  if (conversation.katilimcilar && typeof conversation.katilimcilar === 'object') {
    Object.keys(conversation.katilimcilar).forEach((id) => id && set.add(id));
  }
  [conversation.adminId, conversation.hedefId, conversation.veliId, conversation.ogretmenId, conversation.gonderenId, conversation.aliciId].forEach(
    (id) => id && set.add(id)
  );
  return Array.from(set);
}

export function addConversationIndexUpdates(updates, conversationId, conversation = {}) {
  if (!updates || !conversationId) return updates;
  const participantIds = getConversationParticipantIds(conversation);
  participantIds.forEach((userId) => {
    if (userId) updates[`kullaniciKonusmalari/${userId}/${conversationId}`] = true;
  });
  if (conversation.kresId) updates[`kresKonusmalari/${conversation.kresId}/${conversationId}`] = true;
  if (conversation.cocukId) updates[`cocukKonusmalari/${conversation.cocukId}/${conversationId}`] = true;
  if (conversation.sinifId) updates[`sinifKonusmalari/${conversation.sinifId}/${conversationId}`] = true;
  return updates;
}

export async function writeIndexes(updates) {
  if (!updates || Object.keys(updates).length === 0) return;
  await update(ref(database), updates);
}
