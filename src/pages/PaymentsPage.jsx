import React, { useEffect, useMemo, useState } from 'react';
import { Typography, List, Button, Drawer, Form, Input, Select, Tag, message, Empty, Space, Row, Col, Card, Modal, Progress, Checkbox, Segmented } from 'antd';
import { PlusOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { ref, onValue, set, push, update, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME, cardStyle } from '../theme';
import { asArray } from '../utils/crudHelpers';
import { createUserNotification } from '../utils/notificationCenter';
import { denetimKaydiYaz } from '../utils/auditLog';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

// Önümüzdeki kaç gün içinde son ödeme tarihi olanlar "yaklaşan" sayılır
const UPCOMING_DAYS = 7;

const AY_ADLARI = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const getDurumMeta = (t) => ({
  tum: { label: t('payments.all'), color: THEME.primary },
  odendi: { label: t('payments.paidStatus'), color: THEME.green },
  bekliyor: { label: t('payments.pending'), color: THEME.orange },
  gecikti: { label: t('payments.overdueStatus'), color: THEME.red },
});

function safeObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function toList(data) { return Object.entries(safeObject(data)).map(([id, item]) => ({ id, ...safeObject(item) })); }
function pad2(v) { return String(v).padStart(2, '0'); }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function currentMonthKey() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function clampMonth(v) { const n = Number(v); return Number.isFinite(n) ? Math.min(12, Math.max(1, n)) : new Date().getMonth() + 1; }
function parseDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
// Bugünden son ödeme gününe kalan gün (geçmişse negatif); tarih yoksa null
function daysUntil(value) {
  const due = parseDay(value);
  if (!due) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / 86400000);
}
function shiftMonthKey(key, delta) {
  const [y, m] = String(key).split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
}
function monthTitle(key) {
  const [y, m] = String(key).split('-').map(Number);
  return `${AY_ADLARI[m] || m} ${y}`.trim();
}
function addMonths(ay, yil, plus) {
  const index = (Number(yil) * 12) + (clampMonth(ay) - 1) + plus;
  return { ay: (index % 12) + 1, yil: Math.floor(index / 12) };
}
function dueDateWithDay(yil, ay, gun) {
  const day = Math.min(28, Math.max(1, Math.floor(Number(gun)) || 10));
  return `${yil}-${pad2(clampMonth(ay))}-${pad2(day)}`;
}
function formatMoneyZero(value) { return `${toNumber(value).toLocaleString('tr-TR')} ₺`; }
function normalizeDurum(item = {}) {
  const v = String(item.durum || item.status || '').toLowerCase().trim();
  if (['odendi', 'ödendi', 'paid', 'tamamlandi', 'tamamlandı'].includes(v)) return 'odendi';
  if (['gecikti', 'geçti', 'late', 'overdue'].includes(v)) return 'gecikti';
  const due = item.sonOdemeTarihi || item.dueDate;
  const left = daysUntil(due);
  // Son ödeme günü bitmeden (gece yarısına kadar) gecikmiş sayılmaz
  if (left !== null) return left < 0 ? 'gecikti' : 'bekliyor';
  if (due && Date.parse(due) < Date.now()) return 'gecikti';
  return 'bekliyor';
}
function toNumber(value) {
  if (typeof value === 'number') return value;
  const clean = String(value || '0').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}
function formatMoney(value) {
  const number = toNumber(value);
  return number > 0 ? `${number.toLocaleString('tr-TR')} ₺` : '-';
}
function getChildName(cocuk = {}, odeme = {}) {
  return `${cocuk.ad || ''} ${cocuk.soyad || ''}`.trim() || cocuk.adSoyad || cocuk.isim || odeme.cocukAd || odeme.cocukAdi || odeme.childName || odeme.cocukId || 'Çocuk';
}
function getDonem(o = {}) {
  if (o.donem) return o.donem;
  if (o.tarih && String(o.tarih).length >= 7) { const [y, m] = String(o.tarih).split('-'); return `${AY_ADLARI[Number(m)] || m} ${y}`; }
  return `${AY_ADLARI[Number(o.ay)] || o.ay || ''} ${o.yil || ''}`.trim() || 'Dönem yok';
}
function getMonthKey(o = {}) {
  if (o.tarih && String(o.tarih).length >= 7) return String(o.tarih).slice(0, 7);
  const yil = Number(o.yil || o.year);
  const ay = Number(o.ay || o.month);
  if (yil && ay) return `${yil}-${pad2(ay)}`;
  return '';
}
function monthLabel(ay, yil) { return `${AY_ADLARI[Number(ay)] || ay} ${yil || ''}`.trim(); }
function dueDateForMonth(yil, ay) { return `${Number(yil) || new Date().getFullYear()}-${pad2(clampMonth(ay))}-10`; }

// Mobildeki PaymentListScreen.js + PaymentFormScreen.js'in web karşılığı.
export default function PaymentsPage() {
  const { kullanici } = useAuth();
  const { t } = useTranslation();
  const DURUM_META = getDurumMeta(t);
  const kresId = kullanici?.kresId || kullanici?.kurumId || null;

  const [odemeler, setOdemeler] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('tum');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDurum, setSelectedDurum] = useState('bekliyor');
  const [createdAt, setCreatedAt] = useState(Date.now());
  const [planModu, setPlanModu] = useState(false);
  const [taksitSayisi, setTaksitSayisi] = useState('12');
  const [sonGun, setSonGun] = useState('10');
  const [seciliAy, setSeciliAy] = useState(currentMonthKey());
  const [secimModu, setSecimModu] = useState(false);
  const [secili, setSecili] = useState({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [planModalId, setPlanModalId] = useState(null);
  const [planYeniTutar, setPlanYeniTutar] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    let odemelerData = {}, childrenData = {}, odemelerLoaded = false, childrenLoaded = false;
    function build() {
      if (!odemelerLoaded || !childrenLoaded) return;
      const liste = toList(odemelerData)
        .filter((o) => !kresId || !o.kresId || o.kresId === kresId || o.kurumId === kresId)
        .map((o) => {
          const cocuk = safeObject(childrenData[o.cocukId] || childrenData[o.childId]);
          const durum = normalizeDurum(o);
          return {
            ...o,
            durum,
            cocukId: o.cocukId || o.childId || '',
            cocukAd: getChildName(cocuk, o),
            donem: getDonem(o),
            monthKey: getMonthKey(o),
            tutarNumber: toNumber(o.tutar || o.amount),
            kalanGun: durum === 'odendi' ? null : daysUntil(o.sonOdemeTarihi || o.dueDate),
          };
        })
        .sort((a, b) => {
          const dateA = Date.parse(`${a.monthKey || '1970-01'}-01`) || Number(a.createdAt || 0);
          const dateB = Date.parse(`${b.monthKey || '1970-01'}-01`) || Number(b.createdAt || 0);
          return dateB - dateA;
        });
      setOdemeler(liste);
      setLoading(false);
    }

    const odemelerTarget = kresId ? query(ref(database, 'odemeler'), orderByChild('kresId'), equalTo(kresId)) : ref(database, 'odemeler');
    const odemelerUnsub = onValue(odemelerTarget, (snap) => { odemelerData = safeObject(snap.val()); odemelerLoaded = true; build(); }, () => { odemelerLoaded = true; build(); });
    const childrenTarget = kresId ? query(ref(database, 'cocuklar'), orderByChild('kresId'), equalTo(kresId)) : ref(database, 'cocuklar');
    const childrenUnsub = onValue(childrenTarget, (snap) => {
      childrenData = safeObject(snap.val());
      const liste = toList(childrenData).map((c) => ({ ...c, adSoyad: getChildName(c) })).sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'));
      setChildren(liste);
      childrenLoaded = true;
      build();
    }, () => { childrenLoaded = true; build(); });

    return () => { odemelerUnsub(); childrenUnsub(); };
  }, [kresId]);

  // Plan (taksit) özetleri: kalan her zaman ödenmemiş kayıtlardan hesaplanır
  const planMap = useMemo(() => {
    const map = {};
    odemeler.forEach((o) => {
      if (!o.planId) return;
      const p = map[o.planId] || (map[o.planId] = { total: 0, paid: 0, left: 0, leftAmount: 0, unpaid: [] });
      p.total += 1;
      if (o.durum === 'odendi') p.paid += 1;
      else { p.left += 1; p.leftAmount += o.tutarNumber; p.unpaid.push(o); }
    });
    return map;
  }, [odemeler]);

  // Aylık özet: Beklenen / Tahsil edilen / Kalan seçili aya göre; Geciken ve Yaklaşan tüm aylar
  const stats = useMemo(() => {
    const ayKaydi = seciliAy === 'all' ? odemeler : odemeler.filter((o) => o.monthKey === seciliAy);
    const sum = (arr) => arr.reduce((total, o) => total + o.tutarNumber, 0);
    const odenenler = ayKaydi.filter((o) => o.durum === 'odendi');
    const kalanlar = ayKaydi.filter((o) => o.durum !== 'odendi');
    const geciken = odemeler.filter((o) => o.durum === 'gecikti');
    const yaklasan = odemeler
      .filter((o) => o.durum === 'bekliyor' && o.kalanGun !== null && o.kalanGun >= 0 && o.kalanGun <= UPCOMING_DAYS)
      .sort((a, b) => a.kalanGun - b.kalanGun);
    const beklenen = sum(ayKaydi);
    const tahsil = sum(odenenler);
    return {
      ayKaydi, geciken, yaklasan, beklenen, tahsil,
      kalan: sum(kalanlar),
      odenenAdet: odenenler.length,
      kalanAdet: kalanlar.length,
      gecikenTutar: sum(geciken),
      yaklasanTutar: sum(yaklasan),
      yuzde: beklenen > 0 ? Math.min(100, Math.round((tahsil / beklenen) * 100)) : 0,
    };
  }, [odemeler, seciliAy]);

  const filtered = useMemo(() => {
    if (filter === 'gecikti') return stats.geciken;
    if (filter === 'yaklasan') return stats.yaklasan;
    if (filter === 'tum') return stats.ayKaydi;
    return stats.ayKaydi.filter((o) => o.durum === filter);
  }, [filter, stats]);

  const seciliListe = useMemo(() => odemeler.filter((o) => secili[o.id] && o.durum !== 'odendi'), [odemeler, secili]);

  async function odendiYap(item) {
    try {
      await update(ref(database, `odemeler/${item.id}`), { durum: 'odendi', status: 'odendi', odemeTarihi: item.odemeTarihi || todayKey(), updatedAt: Date.now() });
      message.success(t('payments.statusUpdated'));
      denetimKaydiYaz({
        kresId,
        kullanici,
        islem: 'guncelle',
        modul: 'Ödemeler',
        hedef: getChildName(children.find((c) => c.id === item.cocukId) || {}, item),
        detay: `${item.donem || getDonem(item)} · ${formatMoney(item.tutarNumber ?? item.tutar)} · Ödendi olarak işaretlendi`,
      });
    } catch {
      message.error(t('payments.statusError'));
    }
  }

  function toggleSecim(item) {
    if (item.durum === 'odendi') return;
    setSecili((prev) => {
      const next = { ...prev };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = true;
      return next;
    });
  }

  function listedekileriSec() {
    const next = {};
    filtered.filter((o) => o.durum !== 'odendi').forEach((o) => { next[o.id] = true; });
    setSecili(next);
  }

  function secimiKapat() {
    setSecimModu(false);
    setSecili({});
  }

  function seciliOdendiOnayla() {
    if (!seciliListe.length || bulkBusy) return;
    const toplam = seciliListe.reduce((total, o) => total + o.tutarNumber, 0);
    Modal.confirm({
      title: t('payments.confirmBulkTitle'),
      content: t('payments.confirmBulkBody', { count: seciliListe.length, total: formatMoneyZero(toplam) }),
      okText: t('payments.confirmBtn'),
      cancelText: t('common.cancel'),
      onOk: () => seciliOdendiYap(toplam),
    });
  }

  async function seciliOdendiYap(toplam) {
    setBulkBusy(true);
    try {
      const updates = {};
      const now = Date.now();
      const bugun = todayKey();
      seciliListe.forEach((o) => {
        updates[`${o.id}/durum`] = 'odendi';
        updates[`${o.id}/status`] = 'odendi';
        updates[`${o.id}/odemeTarihi`] = o.odemeTarihi || bugun;
        updates[`${o.id}/updatedAt`] = now;
      });
      // Tek toplu yazma: ya hepsi güncellenir ya hiçbiri
      await update(ref(database, 'odemeler'), updates);
      message.success(t('payments.statusUpdated'));
      denetimKaydiYaz({ kresId, kullanici, islem: 'guncelle', modul: 'Ödemeler', hedef: `${seciliListe.length} ödeme`, detay: `Toplu ödendi olarak işaretlendi · ${formatMoneyZero(toplam)}` });
      secimiKapat();
    } catch {
      message.error(t('payments.statusError'));
    } finally {
      setBulkBusy(false);
    }
  }

  function planAc(item) {
    setPlanYeniTutar('');
    setPlanModalId(item.planId);
  }

  function planKapat() {
    setPlanModalId(null);
    setPlanYeniTutar('');
  }

  async function planTutarGuncelle() {
    const plan = planModalId ? planMap[planModalId] : null;
    if (!plan || !plan.unpaid.length || planBusy) return;
    const amount = toNumber(planYeniTutar);
    if (!(amount > 0)) { message.error(t('payments.planInvalidAmount')); return; }
    setPlanBusy(true);
    try {
      const updates = {};
      const now = Date.now();
      plan.unpaid.forEach((o) => {
        updates[`${o.id}/tutar`] = amount;
        updates[`${o.id}/amount`] = amount;
        updates[`${o.id}/updatedAt`] = now;
      });
      await update(ref(database, 'odemeler'), updates);
      message.success(t('payments.updated'));
      denetimKaydiYaz({ kresId, kullanici, islem: 'guncelle', modul: 'Ödemeler', hedef: plan.unpaid[0]?.cocukAd || '', detay: `Ödeme planı: kalan ${plan.unpaid.length} ay · yeni aylık tutar ${formatMoneyZero(amount)}` });
      planKapat();
    } catch {
      message.error(t('payments.saveError'));
    } finally {
      setPlanBusy(false);
    }
  }

  function planIptalOnayla() {
    const plan = planModalId ? planMap[planModalId] : null;
    if (!plan || !plan.unpaid.length || planBusy) return;
    Modal.confirm({
      title: t('payments.planCancel'),
      content: t('payments.planCancelConfirm', { count: plan.unpaid.length }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: planIptalEt,
    });
  }

  async function planIptalEt() {
    const plan = planModalId ? planMap[planModalId] : null;
    if (!plan) return;
    setPlanBusy(true);
    try {
      const updates = {};
      plan.unpaid.forEach((o) => { updates[o.id] = null; });
      await update(ref(database, 'odemeler'), updates);
      message.success(t('payments.updated'));
      denetimKaydiYaz({ kresId, kullanici, islem: 'sil', modul: 'Ödemeler', hedef: plan.unpaid[0]?.cocukAd || '', detay: `Ödeme planı iptal edildi · ${plan.unpaid.length} ödenmemiş kayıt silindi` });
      planKapat();
    } catch {
      message.error(t('payments.saveError'));
    } finally {
      setPlanBusy(false);
    }
  }

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setSelectedChildId(children[0]?.id || '');
    setSelectedMonth(new Date().getMonth() + 1);
    setSelectedYear(new Date().getFullYear());
    setSelectedDurum('bekliyor');
    setCreatedAt(Date.now());
    setPlanModu(false);
    setTaksitSayisi('12');
    setSonGun('10');
    form.setFieldsValue({ baslik: 'Aylık Kreş Ücreti', sonOdemeTarihi: dueDateForMonth(new Date().getFullYear(), new Date().getMonth() + 1) });
    setDrawerOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setPlanModu(false);
    setSelectedChildId(item.cocukId);
    setSelectedMonth(clampMonth(item.ay || String(item.tarih || '').split('-')[1]));
    setSelectedYear(Number(item.yil || String(item.tarih || '').split('-')[0]) || new Date().getFullYear());
    setSelectedDurum(item.durum);
    setCreatedAt(item.createdAt || Date.now());
    form.setFieldsValue({ baslik: item.baslik || item.title || 'Aylık Kreş Ücreti', tutar: String(item.tutar || item.amount || ''), sonOdemeTarihi: item.sonOdemeTarihi || item.dueDate || '', odemeTarihi: item.odemeTarihi || item.paymentDate || '', aciklama: item.aciklama || item.description || '' });
    setDrawerOpen(true);
  };

  const planAktif = planModu && !editingId;
  const planAdetNum = Math.floor(Number(taksitSayisi));
  const planTutarNum = toNumber(Form.useWatch('tutar', form));
  const planOzet = planAktif && planAdetNum >= 1 && planAdetNum <= 12 && planTutarNum > 0
    ? (() => {
        const son = addMonths(selectedMonth, selectedYear, planAdetNum - 1);
        return t('payments.planSummary', {
          count: planAdetNum,
          amount: formatMoneyZero(planTutarNum),
          total: formatMoneyZero(planTutarNum * planAdetNum),
          first: monthLabel(selectedMonth, selectedYear),
          last: monthLabel(son.ay, son.yil),
        });
      })()
    : '';

  const handleSave = async () => {
    let values;
    try { values = await form.validateFields(); } catch { return; }
    if (!selectedChildId) { message.error(t('payments.childRequired')); return; }
    const finalTutar = toNumber(values.tutar);
    if (!finalTutar || finalTutar <= 0) { message.error(t('payments.validAmount')); return; }
    if (!Number.isInteger(selectedYear) || selectedYear < 2000 || selectedYear > 2100) { message.error(t('payments.validYear')); return; }

    setSaving(true);
    try {
      const cocuk = children.find((c) => c.id === selectedChildId) || {};
      const veliIds = asArray(cocuk.veliIds || cocuk.parentIds || cocuk.veliler).filter(Boolean);
      const finalVeliIds = veliIds.length ? veliIds : (cocuk.veliId || cocuk.parentId ? [cocuk.veliId || cocuk.parentId] : []);

      // ---- Ödeme planı (taksit): tek seferde N aylık kayıt oluşturur ----
      if (!editingId && planModu) {
        const adet = Math.floor(Number(taksitSayisi));
        if (!Number.isFinite(adet) || adet < 1 || adet > 12) { message.error(t('payments.planInvalidCount')); return; }
        const gun = Math.floor(Number(sonGun));
        if (!Number.isFinite(gun) || gun < 1 || gun > 28) { message.error(t('payments.planInvalidDay')); return; }

        const planId = push(ref(database, 'odemeler')).key;
        const baseTitle = values.baslik.trim() || 'Aylık Kreş Ücreti';
        const now = Date.now();
        const updates = {};
        for (let i = 0; i < adet; i += 1) {
          const m = addMonths(selectedMonth, selectedYear, i);
          const key = push(ref(database, 'odemeler')).key;
          const taksitBaslik = adet > 1 ? `${baseTitle} (${i + 1}/${adet})` : baseTitle;
          updates[key] = {
            kresId, cocukId: selectedChildId, childId: selectedChildId,
            veliId: finalVeliIds[0] || null, parentId: finalVeliIds[0] || null, veliIds: finalVeliIds, parentIds: finalVeliIds,
            baslik: taksitBaslik, title: taksitBaslik,
            aciklama: (values.aciklama || '').trim() || taksitBaslik,
            ay: m.ay, yil: m.yil, donem: monthLabel(m.ay, m.yil), tarih: `${m.yil}-${pad2(m.ay)}`,
            tutar: finalTutar, amount: finalTutar, durum: 'bekliyor', status: 'bekliyor',
            sonOdemeTarihi: dueDateWithDay(m.yil, m.ay, gun), odemeTarihi: null,
            planId, taksitNo: i + 1, taksitSayisi: adet,
            createdAt: now, updatedAt: now,
          };
        }
        // Tek toplu yazma: ya hepsi oluşur ya hiçbiri
        await update(ref(database, 'odemeler'), updates);

        // 12 ayrı bildirim yerine tek bildirim
        if (finalVeliIds.length > 0) {
          await createUserNotification({ kresId, userIds: finalVeliIds, baslik: '💳 Ödeme planı oluşturuldu', mesaj: `${getChildName(cocuk)} için ${adet} aylık, aylık ${formatMoney(finalTutar)} tutarında ödeme planı oluşturuldu.`, tip: 'odeme', routeName: 'ParentPayments', createdBy: kullanici?.uid || kullanici?.id || '' });
        }
        message.success(t('payments.planCreated', { count: adet }));
        setDrawerOpen(false);
        const son = addMonths(selectedMonth, selectedYear, adet - 1);
        denetimKaydiYaz({
          kresId,
          kullanici,
          islem: 'ekle',
          modul: 'Ödemeler',
          hedef: getChildName(cocuk),
          detay: `${adet} aylık ödeme planı · aylık ${formatMoney(finalTutar)} · ${monthLabel(selectedMonth, selectedYear)} – ${monthLabel(son.ay, son.yil)}`,
        });
        return;
      }

      const finalOdemeTarihi = selectedDurum === 'odendi' ? (values.odemeTarihi || todayKey()) : (values.odemeTarihi || null);

      const veri = {
        kresId, cocukId: selectedChildId, childId: selectedChildId,
        veliId: finalVeliIds[0] || null, parentId: finalVeliIds[0] || null, veliIds: finalVeliIds, parentIds: finalVeliIds,
        baslik: values.baslik.trim() || 'Aylık Kreş Ücreti', title: values.baslik.trim() || 'Aylık Kreş Ücreti',
        aciklama: (values.aciklama || '').trim() || values.baslik.trim(),
        ay: selectedMonth, yil: selectedYear, donem: monthLabel(selectedMonth, selectedYear), tarih: `${selectedYear}-${pad2(selectedMonth)}`,
        tutar: finalTutar, amount: finalTutar, durum: selectedDurum, status: selectedDurum,
        sonOdemeTarihi: values.sonOdemeTarihi || null, odemeTarihi: finalOdemeTarihi,
        createdAt, updatedAt: Date.now(),
      };

      if (editingId) {
        // set() kaydı tamamen değiştirir ve planId/taksitNo/hatirlatmalar gibi alanları siler;
        // update() sadece formdaki alanları günceller. Son ödeme tarihi değiştiyse
        // hatırlatma geçmişi sıfırlanır ki yeni tarih için hatırlatma tekrar gitsin.
        const eskiKayit = odemeler.find((o) => o.id === editingId);
        const tarihDegisti = (values.sonOdemeTarihi || '') !== (eskiKayit?.sonOdemeTarihi || eskiKayit?.dueDate || '');
        await update(ref(database, `odemeler/${editingId}`), tarihDegisti ? { ...veri, hatirlatmalar: null } : veri);
      } else {
        await push(ref(database, 'odemeler'), veri);
        if (finalVeliIds.length > 0) {
          await createUserNotification({ kresId, userIds: finalVeliIds, baslik: '💳 Yeni ödeme kaydı', mesaj: `${getChildName(cocuk)} için ${monthLabel(selectedMonth, selectedYear)} dönemine ait ${formatMoney(finalTutar)} ödeme kaydı oluşturuldu.`, tip: 'odeme', routeName: 'ParentPayments', createdBy: kullanici?.uid || kullanici?.id || '' });
        }
      }
      message.success(editingId ? t('payments.updated') : t('payments.created'));
      setDrawerOpen(false);

      denetimKaydiYaz({
        kresId,
        kullanici,
        islem: editingId ? 'guncelle' : 'ekle',
        modul: 'Ödemeler',
        hedef: getChildName(cocuk, veri),
        detay: `${veri.donem} · ${formatMoney(finalTutar)} · Durum: ${DURUM_META[selectedDurum]?.label || selectedDurum}`,
      });
    } catch (error) {
      message.error(t('payments.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const ayBasligi = seciliAy === 'all' ? t('payments.allMonths') : monthTitle(seciliAy);
  const modalPlan = planModalId ? planMap[planModalId] : null;
  const FILTER_LABELS = {
    tum: t('payments.all'),
    bekliyor: t('payments.pending'),
    gecikti: t('payments.overdueStatus'),
    yaklasan: `🔔 ${t('payments.upcoming')}`,
    odendi: t('payments.paidStatus'),
  };
  const statCard = (title, value, sub, color) => (
    <Card size="small" style={cardStyle(color)}>
      <Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>
      <div><Text strong style={{ color, fontSize: 18 }}>{value}</Text></div>
      <Text type="secondary" style={{ fontSize: 11 }}>{sub}</Text>
    </Card>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>{t('payments.title')}</Title>
          <Text type="secondary">{t('payments.subtitle')}</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('payments.create')}</Button>
      </div>

      <Space wrap style={{ marginBottom: 12 }}>
        <Button icon={<LeftOutlined />} disabled={seciliAy === 'all'} onClick={() => setSeciliAy(shiftMonthKey(seciliAy, -1))} />
        <Text strong style={{ display: 'inline-block', minWidth: 130, textAlign: 'center', fontSize: 15 }}>{ayBasligi}</Text>
        <Button icon={<RightOutlined />} disabled={seciliAy === 'all'} onClick={() => setSeciliAy(shiftMonthKey(seciliAy, 1))} />
        <Button onClick={() => setSeciliAy(seciliAy === 'all' ? currentMonthKey() : 'all')}>{seciliAy === 'all' ? t('payments.thisMonth') : t('payments.allMonths')}</Button>
        <Button type={secimModu ? 'primary' : 'default'} onClick={() => (secimModu ? secimiKapat() : setSecimModu(true))}>{secimModu ? t('payments.cancelSelect') : t('payments.select')}</Button>
        {secimModu && <Button onClick={listedekileriSec}>{t('payments.selectAll')}</Button>}
        {secimModu && (
          <Button type="primary" loading={bulkBusy} disabled={!seciliListe.length} style={{ background: THEME.green, borderColor: THEME.green }} onClick={seciliOdendiOnayla}>
            {t('payments.markSelectedPaid', { count: seciliListe.length })}
          </Button>
        )}
      </Space>

      <Card size="small" style={{ ...cardStyle(THEME.primary), marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('payments.expected')}</Text>
          <Text strong style={{ fontSize: 18 }}>{formatMoneyZero(stats.beklenen)}</Text>
        </div>
        <Progress percent={stats.yuzde} showInfo={false} strokeColor={THEME.green} style={{ margin: '6px 0 2px' }} />
        <Text strong style={{ fontSize: 12 }}>{t('payments.collectedSummary', { percent: stats.yuzde, paid: formatMoneyZero(stats.tahsil), total: formatMoneyZero(stats.beklenen) })}</Text>
      </Card>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>{statCard(t('payments.collected'), formatMoneyZero(stats.tahsil), t('payments.recordsCount', { count: stats.odenenAdet }), THEME.green)}</Col>
        <Col xs={12} md={6}>{statCard(t('payments.remaining'), formatMoneyZero(stats.kalan), t('payments.recordsCount', { count: stats.kalanAdet }), THEME.orange)}</Col>
        <Col xs={12} md={6}>{statCard(t('payments.overdue'), formatMoneyZero(stats.gecikenTutar), t('payments.recordsCount', { count: stats.geciken.length }), THEME.red)}</Col>
        <Col xs={12} md={6}>{statCard(t('payments.upcoming'), formatMoneyZero(stats.yaklasanTutar), t('payments.recordsCount', { count: stats.yaklasan.length }), THEME.blue)}</Col>
      </Row>

      <Space wrap style={{ marginBottom: 6 }}>
        {['tum', 'bekliyor', 'gecikti', 'yaklasan', 'odendi'].map((key) => (
          <Tag.CheckableTag key={key} checked={filter === key} onChange={() => setFilter(key)}>{FILTER_LABELS[key]}</Tag.CheckableTag>
        ))}
      </Space>
      {(filter === 'gecikti' || filter === 'yaklasan') && (
        <div style={{ marginBottom: 8 }}><Text type="secondary" style={{ fontSize: 12 }}>{t('payments.allMonthsHint')}</Text></div>
      )}
      <div style={{ height: 8 }} />

      <List
        loading={loading}
        dataSource={filtered}
        locale={{ emptyText: <Empty description={t('payments.empty')} /> }}
        renderItem={(item) => {
          const meta = DURUM_META[item.durum];
          const plan = item.planId ? planMap[item.planId] : null;
          const secilebilir = secimModu && item.durum !== 'odendi';

          let gunYazi = '';
          let gunRenk = THEME.muted;
          if (item.durum === 'gecikti' && item.kalanGun !== null && item.kalanGun < 0) {
            gunYazi = t('payments.daysLate', { count: Math.abs(item.kalanGun) });
            gunRenk = THEME.red;
          } else if (item.durum === 'bekliyor' && item.kalanGun !== null && item.kalanGun >= 0 && item.kalanGun <= UPCOMING_DAYS) {
            gunYazi = item.kalanGun === 0 ? t('payments.dueToday') : t('payments.daysLeft', { count: item.kalanGun });
            gunRenk = THEME.orange;
          }

          return (
            <List.Item style={{ background: '#fff', border: `1px solid ${secili[item.id] ? THEME.primary : THEME.border}`, borderRadius: 16, padding: 16, marginBottom: 10 }}>
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  {secilebilir && <Checkbox checked={!!secili[item.id]} onChange={() => toggleSecim(item)} style={{ marginRight: 12, marginTop: 2 }} />}
                  <div onClick={() => (secimModu ? toggleSecim(item) : openEdit(item))} style={{ cursor: 'pointer', flex: 1 }}>
                    <Text strong style={{ fontSize: 15 }}>{item.cocukAd}</Text>
                    <div><Text style={{ color: THEME.primary, fontSize: 13, fontWeight: 700 }}>{item.baslik || item.aciklama || t('payments.monthlyFee')}</Text></div>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>{item.donem}</Text></div>
                  </div>
                  <Tag color={meta.color}>{t(`payments.${item.durum === 'odendi' ? 'paidStatus' : item.durum === 'gecikti' ? 'overdueStatus' : 'pending'}`)}</Tag>
                </div>
                {plan && (
                  <div style={{ marginTop: 10, background: THEME.primarySoft, color: THEME.primaryDark, borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                    {t('payments.planProgress', { paid: plan.paid, total: plan.total, left: plan.left, amount: formatMoneyZero(plan.leftAmount) })}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${THEME.border}` }}>
                  <div><Text type="secondary" style={{ fontSize: 11 }}>{t('payments.amount')}</Text><div><Text strong style={{ fontSize: 18 }}>{formatMoney(item.tutar || item.amount)}</Text></div></div>
                  <div style={{ textAlign: 'right' }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>{item.odemeTarihi ? t('payments.paymentDate') : t('payments.dueDate')}</Text>
                    <div><Text strong style={{ fontSize: 13 }}>{item.odemeTarihi || item.sonOdemeTarihi || '-'}</Text></div>
                    {gunYazi && <div><Text strong style={{ fontSize: 11, color: gunRenk }}>{gunYazi}</Text></div>}
                  </div>
                </div>
                {!secimModu && (
                  <Space style={{ marginTop: 12, width: '100%' }}>
                    <Button size="small" onClick={() => openEdit(item)}>{t('payments.edit')}</Button>
                    {plan && plan.left > 0 && <Button size="small" onClick={() => planAc(item)}>{t('payments.planMenu')}</Button>}
                    {item.durum !== 'odendi' && <Button size="small" type="primary" style={{ background: THEME.green, borderColor: THEME.green }} onClick={() => odendiYap(item)}>{t('payments.markPaid')}</Button>}
                  </Space>
                )}
              </div>
            </List.Item>
          );
        }}
      />

      <Drawer title={editingId ? t('payments.editTitle') : t('payments.newTitle')} open={drawerOpen} onClose={() => setDrawerOpen(false)} width={460} extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? t('payments.update') : t('payments.createAction')}</Button>}>
        <Text strong>{t('payments.childSelection')}</Text>
        <Select style={{ width: '100%', marginTop: 6, marginBottom: 16 }} value={selectedChildId || undefined} onChange={setSelectedChildId} placeholder={children.length === 0 ? t('payments.noChildren') : t('payments.selectChild')} disabled={children.length === 0} options={children.map((c) => ({ value: c.id, label: c.adSoyad }))} />

        {!editingId && (
          <Segmented
            block
            style={{ marginBottom: 16 }}
            value={planModu ? 'plan' : 'single'}
            onChange={(v) => setPlanModu(v === 'plan')}
            options={[{ label: t('payments.planSingle'), value: 'single' }, { label: t('payments.planMode'), value: 'plan' }]}
          />
        )}

        <Space style={{ marginBottom: 12 }}>
          <Button size="small" onClick={() => { const d = new Date(); setSelectedMonth(d.getMonth() + 1); setSelectedYear(d.getFullYear()); form.setFieldsValue({ sonOdemeTarihi: dueDateForMonth(d.getFullYear(), d.getMonth() + 1) }); }}>{t('payments.thisMonthBtn')}</Button>
          <Button size="small" onClick={() => { const d = new Date(); d.setMonth(d.getMonth() + 1); setSelectedMonth(d.getMonth() + 1); setSelectedYear(d.getFullYear()); form.setFieldsValue({ sonOdemeTarihi: dueDateForMonth(d.getFullYear(), d.getMonth() + 1) }); }}>{t('payments.nextMonth')}</Button>
        </Space>

        <Form form={form} layout="vertical">
          <Form.Item name="baslik" label={t('payments.heading')} rules={[{ required: true, message: t('payments.required') }]}>
            <Input placeholder="Aylık Kreş Ücreti" />
          </Form.Item>

          <Text strong>{t('payments.month')}</Text>
          <Space wrap style={{ marginTop: 6, marginBottom: 16 }}>
            {AY_ADLARI.slice(1).map((ad, i) => (
              <Tag.CheckableTag key={ad} checked={selectedMonth === i + 1} onChange={() => setSelectedMonth(i + 1)}>{ad.slice(0, 3)}</Tag.CheckableTag>
            ))}
          </Space>

          <Form.Item label={t('payments.year')}>
            <Input value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value.replace(/[^0-9]/g, '')) || new Date().getFullYear())} placeholder="2026" maxLength={4} />
          </Form.Item>

          <Form.Item
            name="tutar"
            label={t('payments.amount')}
            rules={[
              { required: true, message: t('payments.required') },
              { validator: (_, value) => (toNumber(value) > 0 ? Promise.resolve() : Promise.reject(new Error(t('payments.greaterZero')))) },
            ]}
          >
            <Input placeholder="7500" inputMode="decimal" />
          </Form.Item>

          {planAktif && (
            <>
              <Form.Item label={t('payments.planCount')}>
                <Input value={taksitSayisi} onChange={(e) => setTaksitSayisi(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" maxLength={2} placeholder="12" />
              </Form.Item>
              <Form.Item label={t('payments.planDay')} extra={planOzet || undefined}>
                <Input value={sonGun} onChange={(e) => setSonGun(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" maxLength={2} placeholder="10" />
              </Form.Item>
            </>
          )}

          {!planAktif && (
            <>
              <Text strong>{t('payments.status')}</Text>
              <Space wrap style={{ marginTop: 6, marginBottom: 16 }}>
                {['bekliyor', 'odendi', 'gecikti'].map((d) => (
                  <Tag.CheckableTag key={d} checked={selectedDurum === d} onChange={() => setSelectedDurum(d)}>{t(`payments.${d === 'bekliyor' ? 'pending' : d === 'odendi' ? 'paidStatus' : 'overdueStatus'}`)}</Tag.CheckableTag>
                ))}
              </Space>

              <Form.Item name="sonOdemeTarihi" label={t('payments.dueDateLabel')} extra={`Örnek: ${dueDateForMonth(selectedYear, selectedMonth)}`}>
                <Input placeholder="YYYY-AA-GG" maxLength={10} />
              </Form.Item>
              <Form.Item name="odemeTarihi" label={t('payments.paymentDateLabel')}>
                <Input placeholder="YYYY-AA-GG" maxLength={10} />
              </Form.Item>
            </>
          )}
          <Form.Item name="aciklama" label={t('payments.description')}>
            <Input.TextArea rows={3} placeholder="Örn: Haziran aidatı" />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        open={!!modalPlan}
        title={t('payments.planTitle')}
        onCancel={planKapat}
        footer={null}
        destroyOnHidden
      >
        {modalPlan && (
          <div>
            <Text style={{ color: THEME.primaryDark, fontWeight: 700 }}>
              {t('payments.planProgress', { paid: modalPlan.paid, total: modalPlan.total, left: modalPlan.left, amount: formatMoneyZero(modalPlan.leftAmount) })}
            </Text>
            <div style={{ marginTop: 16 }}>
              <Text strong>{t('payments.planNewAmount')}</Text>
              <Input style={{ marginTop: 6 }} value={planYeniTutar} onChange={(e) => setPlanYeniTutar(e.target.value)} inputMode="decimal" placeholder="7500" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 14 }}>
              <Button type="primary" block loading={planBusy} onClick={planTutarGuncelle}>{t('payments.planUpdateRemaining', { count: modalPlan.left })}</Button>
              <Button danger block disabled={planBusy} onClick={planIptalOnayla}>{t('payments.planCancel')}</Button>
              <Button block onClick={planKapat}>{t('payments.close')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
