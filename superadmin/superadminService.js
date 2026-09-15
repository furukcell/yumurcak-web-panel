import { get, ref } from 'firebase/database';
import { database } from '../src/config/firebase';

async function read(path) {
  const snap = await get(ref(database, path));
  return snap.exists() ? snap.val() : {};
}
function asEntries(value) { return Object.entries(value || {}); }

export async function getPlatformSnapshot() {
  const [kresler, kullanicilar, cocuklar, siniflar, abonelikler] = await Promise.all([
    read('kresler'), read('kullanicilar'), read('cocuklar'), read('siniflar'), read('abonelikler'),
  ]);
  const institutions = asEntries(kresler).map(([id, item]) => ({ id, ...(item || {}) }));
  const users = asEntries(kullanicilar).map(([id, item]) => ({ id, ...(item || {}) }));
  const children = asEntries(cocuklar).map(([id, item]) => ({ id, ...(item || {}) }));
  const classes = asEntries(siniflar).map(([id, item]) => ({ id, ...(item || {}) }));
  const subscriptions = asEntries(abonelikler).map(([id, item]) => ({ id, ...(item || {}) }));
  const usersByKres = users.reduce((acc, user) => { if (user.kresId) acc[user.kresId] = (acc[user.kresId] || 0) + 1; return acc; }, {});
  const childrenByKres = children.reduce((acc, child) => { if (child.kresId) acc[child.kresId] = (acc[child.kresId] || 0) + 1; return acc; }, {});
  const classesByKres = classes.reduce((acc, item) => { if (item.kresId) acc[item.kresId] = (acc[item.kresId] || 0) + 1; return acc; }, {});
  const subscriptionsByKres = subscriptions.reduce((acc, item) => { const id = item.kresId || item.kres; if (id) acc[id] = item; return acc; }, {});
  return { institutions, users, children, classes, subscriptions, usersByKres, childrenByKres, classesByKres, subscriptionsByKres, fetchedAt: Date.now() };
}

export async function getUsageLogs() { return read('hataLoglari/kullanimLoglari'); }
export function normalizeUsageLogs(raw) {
  return asEntries(raw).filter(([, value]) => value && typeof value === 'object').map(([key, value]) => ({ id: key, ...value })).filter((row) => row.tip === 'kullanim' || row.kullaniciId || row.timestamp).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}
export function usageSummary(logs) {
  const now = Date.now(); const day = 86400000; const d = new Date(); d.setHours(0, 0, 0, 0); const todayStart = d.getTime();
  const last7Start = now - 7 * day; const last30Start = now - 30 * day; const valid = logs.filter((log) => Number(log.timestamp) > 0);
  const userIds = (from) => new Set(valid.filter((x) => Number(x.timestamp) >= from).map((x) => x.kullaniciId).filter(Boolean));
  const institutions = (from) => new Set(valid.filter((x) => Number(x.timestamp) >= from).map((x) => x.kresId).filter(Boolean));
  return { now, todayStart, last7Start, last30Start, totalEvents: valid.length, todayEvents: valid.filter((x) => Number(x.timestamp) >= todayStart).length, activeUsersToday: userIds(todayStart).size, activeUsers7d: userIds(last7Start).size, activeUsers30d: userIds(last30Start).size, activeInstitutionsToday: institutions(todayStart).size, activeInstitutions7d: institutions(last7Start).size };
}
export function dailyUsageSeries(logs, days = 30) {
  const result = []; const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i += 1) { const date = new Date(start); date.setDate(start.getDate() + i); const from = date.getTime(); const dayLogs = logs.filter((x) => Number(x.timestamp) >= from && Number(x.timestamp) < from + 86400000); result.push({ key: date.toISOString().slice(0, 10), label: date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }), events: dayLogs.length, users: new Set(dayLogs.map((x) => x.kullaniciId).filter(Boolean)).size, institutions: new Set(dayLogs.map((x) => x.kresId).filter(Boolean)).size }); }
  return result;
}
export function getUsageHealth({ activeUsers, totalUsers, events7d, modules7d }) {
  if (!totalUsers) return events7d ? 55 : 0;
  const userScore = Math.min(100, (activeUsers / totalUsers) * 100); const activityScore = Math.min(100, events7d * 4); const moduleScore = Math.min(100, modules7d * 12.5);
  return Math.round(userScore * 0.55 + activityScore * 0.3 + moduleScore * 0.15);
}
export function healthLabel(score) { if (score >= 75) return { label: 'Çok aktif', color: 'green' }; if (score >= 45) return { label: 'Aktif', color: 'blue' }; if (score >= 20) return { label: 'Düşük kullanım', color: 'orange' }; return { label: 'Pasif', color: 'red' }; }

export function getTrialInfo(subscription, logs = []) {
  const endRaw = subscription?.demoBitisTarihi || (String(subscription?.durum || '').toLowerCase().includes('demo') ? subscription?.bitisTarihi : '');
  if (!endRaw) return null;
  const end = new Date(endRaw); if (Number.isNaN(end.getTime())) return null;
  const startRaw = subscription?.demoBaslangicTarihi || subscription?.baslangicTarihi;
  const start = startRaw ? new Date(startRaw) : new Date(end.getTime() - 15 * 86400000);
  const startMs = start.getTime(); const endMs = end.getTime(); const now = Date.now();
  const elapsedDay = Math.max(1, Math.min(15, Math.floor((now - startMs) / 86400000) + 1));
  const totalEvents = logs.filter((x) => Number(x.timestamp) >= startMs && Number(x.timestamp) <= Math.min(now, endMs)).length;
  const activeUsers = new Set(logs.filter((x) => Number(x.timestamp) >= startMs && Number(x.timestamp) <= Math.min(now, endMs)).map((x) => x.kullaniciId).filter(Boolean)).size;
  const modules = new Set(logs.filter((x) => Number(x.timestamp) >= startMs && Number(x.timestamp) <= Math.min(now, endMs)).map((x) => x.modul || x.module).filter(Boolean)).size;
  const remainingDays = Math.max(0, Math.ceil((endMs - now) / 86400000));
  return { start, end, elapsedDay, remainingDays, totalEvents, activeUsers, modules, ended: now > endMs };
}
