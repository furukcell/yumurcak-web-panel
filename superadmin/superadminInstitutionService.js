import { initializeApp, getApps } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { push, ref, update } from 'firebase/database';
import { database, firebaseConfig } from '../src/config/firebase';

const provisioningApp = getApps().find((item) => item.name === 'yumurcak-provisioning')
  || initializeApp(firebaseConfig, 'yumurcak-provisioning');
const provisioningAuth = getAuth(provisioningApp);

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9._-]/g, '');
}

function usernameToEmail(username) {
  const clean = normalizeUsername(username);
  if (clean.includes('@')) return clean;
  return `${clean || 'kullanici'}@yumurcak.local`;
}

export async function createInstitution(form) {
  const username = normalizeUsername(form.kullaniciAdi);
  const email = usernameToEmail(username);
  const password = String(form.sifre || '').trim();
  const demoDays = Number(form.demoGun) || 30;
  const now = Date.now();
  const endDate = now + demoDays * 86400000;

  const kresRef = push(ref(database, 'kresler'));
  const userRef = push(ref(database, 'kullanicilar'));
  const kresId = kresRef.key;
  const yoneticiId = userRef.key;
  if (!kresId || !yoneticiId) throw new Error('Kayıt anahtarı oluşturulamadı.');

  let authUid = null;
  try {
    const credential = await createUserWithEmailAndPassword(provisioningAuth, email, password);
    authUid = credential.user.uid;

    const kresRecord = {
      id: kresId,
      ad: String(form.ad || '').trim(),
      kresAdi: String(form.ad || '').trim(),
      il: String(form.il || '').trim(),
      ilce: String(form.ilce || '').trim(),
      adres: String(form.adres || '').trim(),
      telefon: String(form.telefon || '').trim(),
      email: String(form.email || '').trim(),
      yoneticiId,
      yoneticiAd: `${String(form.yoneticiAd || '').trim()} ${String(form.yoneticiSoyad || '').trim()}`.trim(),
      yoneticiTelefon: String(form.yoneticiTelefon || '').trim(),
      aktif: true,
      createdAt: now,
      updatedAt: now,
    };

    const userRecord = {
      uid: yoneticiId,
      id: yoneticiId,
      authUid,
      email,
      authProvider: 'firebase',
      authCreatedAt: now,
      authUpdatedAt: now,
      kresId,
      ad: String(form.yoneticiAd || '').trim(),
      soyad: String(form.yoneticiSoyad || '').trim(),
      telefon: String(form.yoneticiTelefon || '').trim(),
      kullaniciAdi: username,
      sifre: password,
      rol: 'yonetici',
      aktif: true,
      createdAt: now,
      updatedAt: now,
    };

    const updates = {};
    updates[`kresler/${kresId}`] = kresRecord;
    updates[`kullanicilar/${yoneticiId}`] = userRecord;
    updates[`authKullaniciIndex/${authUid}`] = yoneticiId;
    updates[`kullaniciAdiIndex/${username}`] = yoneticiId;
    updates[`kresKullanicilari/${kresId}/yoneticiler/${yoneticiId}`] = true;
    updates[`kullaniciKresleri/${yoneticiId}/${kresId}`] = true;
    updates[`abonelikler/${kresId}`] = {
      kresId,
      plan: 'demo',
      durum: 'demo',
      baslangicTarihi: now,
      bitisTarihi: endDate,
      demoGun: demoDays,
      fiyat: 0,
      paraBirimi: 'TRY',
      not: 'Süper admin tarafından oluşturulan demo abonelik.',
      createdAt: now,
      updatedAt: now,
    };

    await update(ref(database), updates);
    return { kresId, yoneticiId, authUid, email, username, password, demoDays, kresRecord };
  } catch (error) {
    if (provisioningAuth.currentUser?.uid === authUid) {
      try { await provisioningAuth.currentUser.delete(); } catch (_) { /* Auth cleanup best effort */ }
    }
    throw error;
  }
}

export async function deleteInstitution(kresId, snapshot) {
  if (!kresId) throw new Error('Kreş ID bulunamadı.');

  const users = (snapshot?.users || []).filter((item) => item.kresId === kresId);
  const children = (snapshot?.children || []).filter((item) => item.kresId === kresId);
  const classes = (snapshot?.classes || []).filter((item) => item.kresId === kresId);
  const updates = {
    [`kresler/${kresId}`]: null,
    [`abonelikler/${kresId}`]: null,
    [`kresKullanicilari/${kresId}`]: null,
    [`kresCocuklari/${kresId}`]: null,
    [`kresSiniflari/${kresId}`]: null,
  };

  users.forEach((user) => {
    updates[`kullanicilar/${user.id}`] = null;
    updates[`kullaniciKresleri/${user.id}/${kresId}`] = null;
    if (user.authUid) updates[`authKullaniciIndex/${user.authUid}`] = null;
    const username = normalizeUsername(user.kullaniciAdi || user.kullanici_adi || user.username || user.userName);
    if (username) updates[`kullaniciAdiIndex/${username}`] = null;
  });

  children.forEach((child) => {
    updates[`cocuklar/${child.id}`] = null;
    if (child.sinifId) updates[`sinifCocuklari/${child.sinifId}/${child.id}`] = null;
    const veliIds = Array.isArray(child.veliIds) ? child.veliIds : [];
    veliIds.forEach((veliId) => { if (veliId) updates[`veliCocuklari/${veliId}/${child.id}`] = null; });
  });

  classes.forEach((sinif) => {
    updates[`siniflar/${sinif.id}`] = null;
    const teacherIds = Array.isArray(sinif.ogretmenIds)
      ? sinif.ogretmenIds
      : sinif.ogretmenId ? [sinif.ogretmenId] : [];
    teacherIds.forEach((teacherId) => { if (teacherId) updates[`ogretmenSiniflari/${teacherId}/${sinif.id}`] = null; });
  });

  await update(ref(database), updates);
  return { users: users.length, children: children.length, classes: classes.length };
}

export async function setInstitutionActive(kresId, aktif) {
  if (!kresId) throw new Error('Kreş ID bulunamadı.');
  await update(ref(database), {
    [`kresler/${kresId}/aktif`]: !!aktif,
    [`kresler/${kresId}/updatedAt`]: Date.now(),
  });
  return { kresId, aktif: !!aktif };
}
