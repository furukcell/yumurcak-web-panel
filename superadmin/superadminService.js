import { get, ref } from 'firebase/database';
import { database } from '../src/config/firebase';

async function read(path) {
  const snap = await get(ref(database, path));
  return snap.exists() ? snap.val() : {};
}

function asEntries(value) {
  return Object.entries(value || {});
}

export async function getPlatformSnapshot() {
  const [kresler, kullanicilar, cocuklar, siniflar, abonelikler] = await Promise.all([
    read('kresler'),
    read('kullanicilar'),
    read('cocuklar'),
    read('siniflar'),
    read('abonelikler'),
  ]);

  const institutions = asEntries(kresler).map(([id, item]) => ({ id, ...(item || {}) }));
  const users = asEntries(kullanicilar).map(([id, item]) => ({ id, ...(item || {}) }));
  const children = asEntries(cocuklar).map(([id, item]) => ({ id, ...(item || {}) }));
  const classes = asEntries(siniflar).map(([id, item]) => ({ id, ...(item || {}) }));
  const subscriptions = asEntries(abonelikler).map(([id, item]) => ({ id, ...(item || {}) }));

  const usersByKres = users.reduce((acc, user) => {
    if (!user.kresId) return acc;
    acc[user.kresId] = (acc[user.kresId] || 0) + 1;
    return acc;
  }, {});

  const childrenByKres = children.reduce((acc, child) => {
    if (!child.kresId) return acc;
    acc[child.kresId] = (acc[child.kresId] || 0) + 1;
    return acc;
  }, {});

  const classesByKres = classes.reduce((acc, item) => {
    if (!item.kresId) return acc;
    acc[item.kresId] = (acc[item.kresId] || 0) + 1;
    return acc;
  }, {});

  const subscriptionsByKres = subscriptions.reduce((acc, item) => {
    const kresId = item.kresId || item.kres;
    if (!kresId) return acc;
    acc[kresId] = item;
    return acc;
  }, {});

  return {
    institutions,
    users,
    children,
    classes,
    subscriptions,
    usersByKres,
    childrenByKres,
    classesByKres,
    subscriptionsByKres,
    fetchedAt: Date.now(),
  };
}

export async function getUsageLogs() {
  return read('hataLoglari/kullanimLoglari');
}

export function normalizeUsageLogs(raw) {
  const rows = [];
  asEntries(raw).forEach(([key, value]) => {
    if (value && typeof value === 'object') rows.push({ id: key, ...value });
  });
  return rows
    .filter((row) => row.tip === 'kullanim' || row.kullaniciId || row.timestamp)
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}

export function usageSummary(logs) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = todayStart.getTime();
  const last7 = now - 7 * day;
  const last30 = now - 30 * day;
  const valid = logs.filter((log) => Number(log.timestamp) > 0);

  const userIds = (from) => new Set(valid.filter((x) => x.timestamp >= from).map((x) => x.kullaniciId).filter(Boolean));
  const institutions = (from) => new Set(valid.filter((x) => x.timestamp >= from).map((x) => x.kresId).filter(Boolean));

  return {
    totalEvents: valid.length,
    todayEvents: valid.filter((x) => x.timestamp >= today).length,
    activeUsersToday: userIds(today).size,
    activeUsers7d: userIds(last7).size,
    activeUsers30d: userIds(last30).size,
    activeInstitutionsToday: institutions(today).size,
    activeInstitutions7d: institutions(last7).size,
  };
}
