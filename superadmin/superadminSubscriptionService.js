import { get, onValue, push, ref, set, update } from 'firebase/database';
import { database } from '../src/config/firebase';

export const PACKAGE_TIERS = [
  { id: 'baslangic', title: 'Başlangıç', range: '0 - 30 öğrenci', maxStudent: 30, monthly: 1200, yearly: 12000, badge: 'Ekonomik' },
  { id: 'profesyonel', title: 'Profesyonel', range: '31 - 50 öğrenci', maxStudent: 50, monthly: 2000, yearly: 20000, badge: 'Önerilen' },
  { id: 'kurum', title: 'Kurum', range: '51 - 100 öğrenci', maxStudent: 100, monthly: 4000, yearly: 40000, badge: 'Büyük Kreş' },
];
export const PER_STUDENT_PRICE = 48;
export const MANUAL_SOURCE = 'manuel_iban';

export const formatPrice = (v) => `${Number(v || 0).toLocaleString('tr-TR')} TL`;
export const addMonths = (date, months) => { const d = new Date(date); d.setMonth(d.getMonth() + months); return d; };
export const toDateStr = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const getTierById = (id) => PACKAGE_TIERS.find((x) => x.id === id) || PACKAGE_TIERS[0];
export const getSuggestedTier = (count) => PACKAGE_TIERS.find((x) => Number(count) <= x.maxStudent) || PACKAGE_TIERS[PACKAGE_TIERS.length - 1];
export const computePerStudentPrice = (count, period='aylik') => Number(count || 0) * PER_STUDENT_PRICE * (period === 'yillik' ? 10 : 1);

export function subscriptionStatus(sub) {
  if (!sub) return { key:'none', label:'Abonelik Yok', color:'default', days:null };
  if (sub.erisimKisitli === true) return { key:'restricted', label:'Sonlandırıldı', color:'red', days:null };
  const end = sub.bitisTarihi ? new Date(sub.bitisTarihi) : null;
  const days = end && !Number.isNaN(end.getTime()) ? Math.ceil((end.getTime()-Date.now())/86400000) : null;
  if (days !== null && days < 0) return { key:'expired', label:'Süresi Doldu', color:'red', days };
  if (days !== null && days <= 3) return { key:'expiring', label:`${days} Gün Kaldı`, color:'orange', days };
  if (String(sub.durum).toLowerCase().includes('demo')) return { key:'demo', label:'Demo Aktif', color:'orange', days };
  if (String(sub.durum).toLowerCase().includes('aktif')) return { key:'active', label:'Aktif', color:'green', days };
  return { key:'passive', label:'Pasif', color:'default', days };
}

export function subscribeManualRequests(callback) {
  return onValue(ref(database, 'abonelikTalepleri'), (snap) => {
    const rows = [];
    Object.entries(snap.val() || {}).forEach(([kresId, requests]) => Object.entries(requests || {}).forEach(([talepId, item]) => rows.push({ talepId, kresId, ...(item || {}) })));
    rows.sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    callback(rows);
  });
}

export async function activateManualSubscription({ kresId, tierId, period, customEndDate, price, ogrenciLimiti, manuelNot, odemeReferansi, tanimlayanUid, existingSubscription }) {
  const tier = getTierById(tierId);
  const customLimit = Number(ogrenciLimiti);
  const finalLimit = Number.isFinite(customLimit) && customLimit > 0 ? Math.floor(customLimit) : tier.maxStudent;
  const finalPrice = price === '' || price == null ? (period === 'yillik' ? tier.yearly : tier.monthly) : Number(price);
  const endDate = period === 'ozel' && customEndDate ? customEndDate : toDateStr(addMonths(new Date(), period === 'yillik' ? 12 : 1));
  const record = { kresId, plan: tierId === 'custom' ? `ozel_${period}` : `${tier.id}_${period}`, planTier:tierId === 'custom' ? 'custom' : tier.id, planPeriod:period, ogrenciLimiti:finalLimit, durum:'aktif', baslangicTarihi:existingSubscription?.baslangicTarihi || toDateStr(new Date()), bitisTarihi:endDate, demoBitisTarihi:'', fiyat:finalPrice, paraBirimi:'TRY', kaynak:MANUAL_SOURCE, manuelNot:manuelNot || '', odemeReferansi:odemeReferansi || '', tanimlayanUid:tanimlayanUid || '', erisimKisitli:false, createdAt:existingSubscription?.createdAt || Date.now(), updatedAt:Date.now() };
  await set(ref(database, `abonelikler/${kresId}`), record);
  if (finalPrice > 0) await push(ref(database, `odemeGecmisi/${kresId}`), { kresId, kaynak:MANUAL_SOURCE, tierId:record.planTier, tierTitle:tierId === 'custom' ? `${finalLimit} Öğrenci Özel Limit` : tier.title, period, ogrenciLimiti:finalLimit, fiyat:finalPrice, paraBirimi:'TRY', odemeReferansi:odemeReferansi || '', manuelNot:manuelNot || '', tanimlayanUid:tanimlayanUid || '', tarih:toDateStr(new Date()), createdAt:Date.now() });
}

export async function setManualAccessRestriction({ kresId, restricted, tanimlayanUid='' }) {
  await update(ref(database, `abonelikler/${kresId}`), { erisimKisitli:!!restricted, erisimKisitlayanUid:tanimlayanUid, erisimKisitTarihi:toDateStr(new Date()), updatedAt:Date.now() });
}

export async function endSubscription({ kresId, tanimlayanUid='' }) {
  if (!kresId) throw new Error('Kreş ID bulunamadı.');
  await update(ref(database, `abonelikler/${kresId}`), {
    durum: 'sonlandirildi',
    erisimKisitli: true,
    erisimKisitlayanUid: tanimlayanUid,
    erisimKisitTarihi: toDateStr(new Date()),
    sonlandirmaTarihi: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function updateSubscriptionDetails({ kresId, fiyat, bitisTarihi, tanimlayanUid='' }) {
  if (!kresId) throw new Error('Kreş ID bulunamadı.');
  const updates = { updatedAt: Date.now(), duzenleyenUid: tanimlayanUid };
  if (fiyat !== undefined && fiyat !== null && fiyat !== '') updates.fiyat = Number(fiyat);
  if (bitisTarihi) updates.bitisTarihi = bitisTarihi;
  await update(ref(database, `abonelikler/${kresId}`), updates);
}

export async function confirmManualPayment({ kresId, subscription, tanimlayanUid='' }) {
  const period = subscription?.planPeriod === 'yillik' ? 'yillik' : 'aylik';
  const current = subscription?.bitisTarihi ? new Date(subscription.bitisTarihi) : new Date();
  const base = current > new Date() ? current : new Date();
  const end = toDateStr(addMonths(base, period === 'yillik' ? 12 : 1));
  const tier = getTierById(subscription?.planTier);
  await update(ref(database, `abonelikler/${kresId}`), { durum:'aktif', bitisTarihi:end, erisimKisitli:false, updatedAt:Date.now() });
  await push(ref(database, `odemeGecmisi/${kresId}`), { kresId, kaynak:MANUAL_SOURCE, tierId:tier.id, tierTitle:tier.title, period, fiyat:Number(subscription?.fiyat || 0), paraBirimi:'TRY', tanimlayanUid, tarih:toDateStr(new Date()), createdAt:Date.now() });
}

export async function approveManualRequest({ kresId, talepId, tanimlayanUid='', existingSubscription=null }) {
  const snap = await get(ref(database, `abonelikTalepleri/${kresId}/${talepId}`));
  if (!snap.exists()) throw new Error('Talep bulunamadı.');
  const req = snap.val() || {};
  const count = Number(req.ogrenciSayisi || 0);
  const period = req.period === 'yillik' ? 'yillik' : 'aylik';
  const tier = { id:'per_student', title:`${count} Öğrenci (Özel Fiyat)`, maxStudent:count };
  const price = Number(req.hesaplananTutar ?? computePerStudentPrice(count, period));
  const endDate = toDateStr(addMonths(new Date(), period === 'yillik' ? 12 : 1));
  await set(ref(database, `abonelikler/${kresId}`), { kresId, plan:`per_student_${period}`, planTier:'per_student', planPeriod:period, ogrenciLimiti:count, durum:'aktif', baslangicTarihi:existingSubscription?.baslangicTarihi || toDateStr(new Date()), bitisTarihi:endDate, fiyat:price, paraBirimi:'TRY', kaynak:MANUAL_SOURCE, odemeReferansi:req.odemeReferansi || req.dekontReferansi || '', manuelNot:req.not || '', tanimlayanUid, erisimKisitli:false, createdAt:existingSubscription?.createdAt || Date.now(), updatedAt:Date.now() });
  await push(ref(database, `odemeGecmisi/${kresId}`), { kresId, kaynak:MANUAL_SOURCE, tierId:tier.id, tierTitle:tier.title, period, fiyat:price, paraBirimi:'TRY', odemeReferansi:req.odemeReferansi || req.dekontReferansi || '', tanimlayanUid, tarih:toDateStr(new Date()), createdAt:Date.now() });
  await update(ref(database, `abonelikTalepleri/${kresId}/${talepId}`), { durum:'onaylandi', onaylayanUid:tanimlayanUid, onaylanmaTarihi:Date.now() });
}

export async function rejectManualRequest({ kresId, talepId, redNotu='', tanimlayanUid='' }) {
  await update(ref(database, `abonelikTalepleri/${kresId}/${talepId}`), { durum:'reddedildi', redNotu, reddedenUid:tanimlayanUid, reddedilmeTarihi:Date.now() });
}
