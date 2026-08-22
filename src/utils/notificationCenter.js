// Mobildeki src/services/notificationCenter.js'in web karşılığı
// (RN'e bağımlı değil, birebir taşındı).
import { onValue, push, query, orderByChild, equalTo, ref, serverTimestamp, update } from 'firebase/database';
import { database } from '../config/firebase';

const PATH = 'bildirimler';

export function getUserKey(kullanici) {
  return kullanici?.uid || kullanici?.id || kullanici?.authUid || '';
}

function arr(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'object') return Object.keys(value).filter((key) => value[key]).map(String);
  return [String(value)];
}

function cleanObject(value = {}) {
  return Object.entries(value).reduce((acc, [key, item]) => {
    if (item !== undefined && item !== null && item !== '') acc[key] = item;
    return acc;
  }, {});
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'admin') return 'yonetici';
  if (value === 'yönetici') return 'yonetici';
  if (value === 'öğretmen') return 'ogretmen';
  if (value === 'teacher') return 'ogretmen';
  if (value === 'parent') return 'veli';
  return value;
}

function item(id, data = {}) {
  return {
    id,
    ...data,
    baslik: data.baslik || data.title || 'Bildirim',
    mesaj: data.mesaj || data.aciklama || '',
    tip: data.tip || 'genel',
    routeName: data.routeName || data.hedefEkran || '',
    routeParams: data.routeParams || {},
    createdAt: Number(data.createdAt || data.tarih || 0),
    okunduBy: data.okunduBy || {},
  };
}

export function visibleToUser(bildirim, kullanici = {}) {
  const userKey = getUserKey(kullanici);
  const authKey = kullanici?.authUid || '';
  const role = kullanici?.rol || '';
  const kresId = kullanici?.kresId || '';
  const sinifId = kullanici?.sinifId || '';

  if (bildirim.kresId && kresId && bildirim.kresId !== kresId) return false;

  const userIds = [...arr(bildirim.hedefUserIds), ...arr(bildirim.kullaniciIds)];
  if (userIds.length) return userIds.includes(String(userKey)) || (authKey && userIds.includes(String(authKey)));

  const roles = [...arr(bildirim.hedefRol), ...arr(bildirim.hedefRoller)];
  if (roles.length && !roles.includes('all') && !roles.includes('herkes') && !roles.map(normalizeRole).includes(normalizeRole(role))) return false;

  const sinifIds = [...arr(bildirim.hedefSinifIds), ...arr(bildirim.sinifIds)];
  if (sinifIds.length && sinifId && !sinifIds.includes(String(sinifId))) return false;

  return true;
}

export function isRead(bildirim, kullanici = {}) {
  const userKey = getUserKey(kullanici);
  const authKey = kullanici?.authUid || '';
  return !!bildirim?.okunduBy?.[userKey] || (authKey ? !!bildirim?.okunduBy?.[authKey] : false);
}

export function listenNotifications(kullanici, callback) {
  const kresId = kullanici?.kresId;
  if (!kresId) {
    callback([]);
    return () => {};
  }

  const q = query(ref(database, PATH), orderByChild('kresId'), equalTo(kresId));
  return onValue(q, (snap) => {
    const data = snap.val() || {};
    const list = Object.entries(data)
      .map(([id, value]) => item(id, value))
      .filter((n) => visibleToUser(n, kullanici))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    callback(list);
  });
}

export async function createNotification(payload = {}) {
  const now = Date.now();
  const data = cleanObject({
    baslik: payload.baslik || payload.title || 'Bildirim',
    mesaj: payload.mesaj || payload.aciklama || '',
    tip: payload.tip || 'genel',
    kresId: payload.kresId || '',
    hedefRol: payload.hedefRol || '',
    hedefRoller: payload.hedefRoller || null,
    hedefUserIds: payload.hedefUserIds || null,
    hedefSinifIds: payload.hedefSinifIds || null,
    hedefCocukIds: payload.hedefCocukIds || null,
    routeName: payload.routeName || '',
    routeParams: payload.routeParams || {},
    createdBy: payload.createdBy || '',
    createdAt: now,
    serverCreatedAt: serverTimestamp(),
    okunduBy: {},
    pushStatus: 'pending',
  });

  const notificationRef = await push(ref(database, PATH), data);
  return notificationRef.key;
}

export async function createRoleNotification({ kresId, role, roles, baslik, mesaj, tip, routeName, routeParams, createdBy }) {
  return createNotification({ kresId, hedefRol: role, hedefRoller: roles, baslik, mesaj, tip, routeName, routeParams, createdBy });
}

export async function createUserNotification({ kresId, userIds, baslik, mesaj, tip, routeName, routeParams, createdBy }) {
  const ids = arr(userIds).filter(Boolean);
  if (!ids.length) return;
  return createNotification({ kresId, hedefUserIds: ids, baslik, mesaj, tip, routeName, routeParams, createdBy });
}

export async function readNotification(id, kullanici = {}) {
  const userKey = getUserKey(kullanici);
  if (!id || !userKey) return;
  await update(ref(database, `${PATH}/${id}/okunduBy`), { [userKey]: true });
}

export async function readAllNotifications(list = [], kullanici = {}) {
  const userKey = getUserKey(kullanici);
  if (!userKey || !list.length) return;
  const updates = {};
  list.forEach((n) => {
    if (n?.id) updates[`${PATH}/${n.id}/okunduBy/${userKey}`] = true;
  });
  if (Object.keys(updates).length) await update(ref(database), updates);
}
