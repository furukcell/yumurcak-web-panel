// Mobildeki src/services/monthlyDocuments.js'in web karşılığı (RN'e
// bağımlı değil, birebir taşındı). Aylık, gün-bazlı belgeler (Yemek
// Listesi, Ders Programı, Nöbet Çizelgesi, Personel Görev Listesi) için
// ORTAK servis katmanı.
import { ref, onValue, update, push, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';

export const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export function pad2(value) {
  return String(value).padStart(2, '0');
}
export function getMonthKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}
export function getMonthLabel(date) {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}
export function shiftMonth(date, direction) {
  return new Date(date.getFullYear(), date.getMonth() + direction, 1);
}
export function parseMonthKey(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return new Date();
  return new Date(year, month - 1, 1);
}
export function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

export function getDaysOfMonth(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const total = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: total }, (_, index) => {
    const day = index + 1;
    return { day, dateKey: `${year}-${pad2(month + 1)}-${pad2(day)}`, label: `${pad2(day)} ${MONTH_NAMES[month]}`, weekday: new Date(year, month, day).getDay() };
  });
}

export function createInitialValues(days, emptyValueFactory) {
  return days.reduce((acc, day) => {
    acc[day.dateKey] = emptyValueFactory();
    return acc;
  }, {});
}

export function fetchNodeSnapshotOnce(nodePath, kresId, onError) {
  return new Promise((resolve) => {
    if (!kresId) {
      resolve({});
      return;
    }
    let unsub = null;
    const q = query(ref(database, nodePath), orderByChild('kresId'), equalTo(kresId));
    unsub = onValue(
      q,
      (snap) => { if (unsub) unsub(); resolve(snap.val() || {}); },
      (error) => {
        console.warn(`${nodePath} okunamadı:`, error?.code || error?.message || error);
        if (unsub) unsub();
        if (typeof onError === 'function') onError(error);
        resolve({});
      }
    );
  });
}

function isSameActivePublication(item, { kresId, monthKey, kaynak, matchExtra }) {
  if (!item) return false;
  if (item.kresId !== kresId) return false;
  if (item.ayKey !== monthKey) return false;
  if (item.kaynak !== kaynak) return false;
  if (item.aktif === false) return false;
  if (typeof matchExtra === 'function' && !matchExtra(item)) return false;
  return true;
}

export function countPublished(snapshotValue, filter) {
  return Object.values(snapshotValue || {}).filter((item) => isSameActivePublication(item, filter)).length;
}

export function forClass(sinifId) {
  return (item) => item?.sinifId === sinifId;
}

export async function listPublishedMonths({ nodePath, kresId, kaynak, matchExtra }) {
  const snapshotValue = await fetchNodeSnapshotOnce(nodePath, kresId);
  const counts = {};
  Object.values(snapshotValue || {}).forEach((item) => {
    if (!item) return;
    if (item.kresId !== kresId) return;
    if (item.kaynak !== kaynak) return;
    if (item.aktif === false) return;
    if (typeof matchExtra === 'function' && !matchExtra(item)) return;
    if (!item.ayKey) return;
    counts[item.ayKey] = (counts[item.ayKey] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([monthKey, count]) => ({ monthKey, count, monthLabel: getMonthLabel(parseMonthKey(monthKey)) }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export async function publishMonth({ nodePath, kresId, monthKey, monthLabel, kaynak, days, values, hasContent, buildRecord, matchExtra }) {
  const snapshotValue = await fetchNodeSnapshotOnce(nodePath, kresId);
  const updates = {};
  const now = Date.now();

  Object.entries(snapshotValue).forEach(([id, item]) => {
    if (isSameActivePublication(item, { kresId, monthKey, kaynak, matchExtra })) {
      updates[`${nodePath}/${id}/aktif`] = false;
      updates[`${nodePath}/${id}/updatedAt`] = now;
    }
  });

  let publishedCount = 0;
  days.forEach((day) => {
    const value = values[day.dateKey];
    if (!hasContent(value)) return;
    const key = push(ref(database, nodePath)).key;
    updates[`${nodePath}/${key}`] = buildRecord({ day, value, kresId, monthKey, monthLabel, kaynak, now });
    publishedCount += 1;
  });

  if (Object.keys(updates).length === 0) return 0;
  await update(ref(database), updates);
  return publishedCount;
}

export async function unpublishMonth({ nodePath, kresId, monthKey, kaynak, matchExtra }) {
  const snapshotValue = await fetchNodeSnapshotOnce(nodePath, kresId);
  const updates = {};
  const now = Date.now();
  Object.entries(snapshotValue).forEach(([id, item]) => {
    if (isSameActivePublication(item, { kresId, monthKey, kaynak, matchExtra })) {
      updates[`${nodePath}/${id}/aktif`] = false;
      updates[`${nodePath}/${id}/updatedAt`] = now;
    }
  });
  if (Object.keys(updates).length === 0) return 0;
  await update(ref(database), updates);
  return Object.keys(updates).length / 2;
}

export async function fetchActiveMonthValues({ nodePath, kresId, monthKey, kaynak, matchExtra, valueMapper, onError }) {
  const snapshotValue = await fetchNodeSnapshotOnce(nodePath, kresId, onError);
  const values = {};
  Object.values(snapshotValue || {}).forEach((item) => {
    if (!isSameActivePublication(item, { kresId, monthKey, kaynak, matchExtra })) return;
    const dateKey = item.tarih;
    if (!dateKey) return;
    values[dateKey] = valueMapper(item);
  });
  return values;
}

export async function fetchActiveSingleRecord({ nodePath, kresId, monthKey, kaynak, matchExtra }) {
  const snapshotValue = await fetchNodeSnapshotOnce(nodePath, kresId);
  const match = Object.values(snapshotValue || {}).find((item) => isSameActivePublication(item, { kresId, monthKey, kaynak, matchExtra }));
  return match || null;
}

export async function publishSingleRecord({ nodePath, kresId, monthKey, kaynak, buildRecord, matchExtra }) {
  const snapshotValue = await fetchNodeSnapshotOnce(nodePath, kresId);
  const updates = {};
  const now = Date.now();
  Object.entries(snapshotValue).forEach(([id, item]) => {
    if (isSameActivePublication(item, { kresId, monthKey, kaynak, matchExtra })) {
      updates[`${nodePath}/${id}/aktif`] = false;
      updates[`${nodePath}/${id}/updatedAt`] = now;
    }
  });
  const key = push(ref(database, nodePath)).key;
  updates[`${nodePath}/${key}`] = buildRecord({ kresId, monthKey, kaynak, now });
  await update(ref(database), updates);
  return key;
}

export async function copyFromPreviousMonth({ nodePath, kresId, kaynak, currentMonthDate, days, valueMapper, matchExtra }) {
  const prevDate = shiftMonth(currentMonthDate, -1);
  const prevMonthKey = getMonthKey(prevDate);
  const snapshotValue = await fetchNodeSnapshotOnce(nodePath, kresId);
  const prevItemsByDay = {};

  Object.values(snapshotValue).forEach((item) => {
    if (isSameActivePublication(item, { kresId, monthKey: prevMonthKey, kaynak, matchExtra })) {
      const dayNum = Number(String(item.tarih || '').slice(-2));
      if (dayNum) prevItemsByDay[dayNum] = item;
    }
  });

  const nextValues = {};
  let found = 0;
  days.forEach((day) => {
    const prevItem = prevItemsByDay[day.day];
    if (prevItem) {
      nextValues[day.dateKey] = valueMapper(prevItem);
      found += 1;
    }
  });

  return { values: nextValues, prevMonthKey, found };
}
