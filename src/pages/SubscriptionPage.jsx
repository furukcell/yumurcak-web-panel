import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Card, Button, Input, Progress, Tag, message, Row, Col, Spin, Alert } from 'antd';
import { ref, onValue, get, set, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { getSubscriptionStatus, getSubscriptionEndDate } from '../utils/subscriptionStatus';
import { useTranslation } from 'react-i18next';

const { Title, Text, Paragraph } = Typography;

const PACKAGE_TIERS = [
  { id: 'baslangic', title: 'Başlangıç', range: '0 - 30 öğrenci', minStudent: 0, maxStudent: 30, monthly: 1200, yearly: 12000, desc: 'Küçük kreşler için ideal başlangıç paketi.', badge: 'Ekonomik', color: THEME.green },
  { id: 'profesyonel', title: 'Profesyonel', range: '31 - 50 öğrenci', minStudent: 31, maxStudent: 50, monthly: 2000, yearly: 20000, desc: 'Büyüyen kurumlar için dengeli paket.', badge: 'Önerilen', color: THEME.primary, featured: true },
  { id: 'kurum', title: 'Kurum', range: '51 - 100 öğrenci', minStudent: 51, maxStudent: 100, monthly: 4000, yearly: 40000, desc: 'Yoğun kullanımlı büyük kreşler için.', badge: 'Büyük Kreş', color: THEME.gold },
];

// Faz 15'teki 3 aylık demo kaldırıldı, tek standart demo süresi 1 ay.
const BUILT_IN_PROMOS = { PILOT1AY: { kod: 'PILOT1AY', tip: 'demo', sureAy: 1, aktif: true } };

function formatPrice(value) { return `${Number(value || 0).toLocaleString('tr-TR')} TL`; }
function getTierById(id) { return PACKAGE_TIERS.find((t) => t.id === id) || PACKAGE_TIERS[0]; }
function getSuggestedTier(count) { return PACKAGE_TIERS.find((t) => count <= t.maxStudent) || null; }
function getPlanLabel(subscription, t) {
  if (!subscription?.planTier && !subscription?.plan) return t('subscription.noSub');
  const tier = getTierById(subscription.planTier || String(subscription.plan || '').split('_')[0]);
  const plan = String(subscription.plan || '');
  const period = subscription.planPeriod || (plan.includes('yillik') ? 'yillik' : plan.includes('aylik') ? 'aylik' : '');
  if (!period || period === 'demo') return subscription.plan === 'demo' ? `${t(`subscription.tiers.${tier.id}.title`)} / Demo` : (subscription.plan || tier.title);
  return `${t(`subscription.tiers.${tier.id}.title`)} / ${period === 'yillik' ? t('subscription.yearly') : t('subscription.monthly')}`;
}
function addMonths(date, months) { const next = new Date(date); next.setMonth(next.getMonth() + months); return next; }
function toDateStr(date) { const pad = (v) => String(v).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function getUsagePercent(count, limit) { if (!limit) return 0; return Math.max(0, Math.min(100, Math.round((count / limit) * 100))); }
function getStatusColor(status) {
  if (status.key === 'active') return THEME.green;
  if (status.key === 'demo') return THEME.orange;
  if (status.key === 'expiring_soon' || status.key === 'expired') return THEME.red;
  return THEME.muted;
}

// Mobildeki AdminSubscriptionScreen.js'in web karşılığı. NOT: gerçek
// RevenueCat satın alma akışı App Store/Play Store'a bağlı olduğu için
// mobil-özeldir — web tarafında sadece durum görüntüleme, demo başlatma
// ve promosyon kodu uygulama var. Ücretli plan satın alma mobil
// üzerinden yapılmalı.
export default function SubscriptionPage() {
  const { kullanici } = useAuth();
  const { t } = useTranslation();
  const kresId = kullanici?.kresId || 'kres001';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [children, setChildren] = useState([]);
  const [promoCode, setPromoCode] = useState('');

  useEffect(() => {
    const subUnsub = onValue(ref(database, `abonelikler/${kresId}`), (snap) => { setSubscription(snap.val() || null); setLoading(false); });
    const childQuery = query(ref(database, 'cocuklar'), orderByChild('kresId'), equalTo(kresId));
    const childUnsub = onValue(childQuery, (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id, item]) => ({ id, ...(item || {}) })).filter((i) => i.aktif !== false && i.deleted !== true);
      setChildren(list);
    }, () => setChildren([]));
    return () => { subUnsub(); childUnsub(); };
  }, [kresId]);

  const status = useMemo(() => getSubscriptionStatus(subscription), [subscription]);
  const studentCount = children.length;
  const suggestedTier = getSuggestedTier(studentCount);
  const activeTier = subscription?.planTier ? getTierById(subscription.planTier) : suggestedTier;
  const activeLimit = subscription?.planTier ? getTierById(subscription.planTier).maxStudent : suggestedTier?.maxStudent;
  const overLimit = activeLimit && studentCount > activeLimit;

  const writeSubscription = async ({ tier, selectedPeriod, durum, source, endDate, price }) => {
    await set(ref(database, `abonelikler/${kresId}`), {
      kresId, plan: durum === 'demo' ? 'demo' : `${tier.id}_${selectedPeriod}`, planTier: tier.id, planPeriod: durum === 'demo' ? 'demo' : selectedPeriod,
      ogrenciLimiti: tier.maxStudent, durum, baslangicTarihi: subscription?.baslangicTarihi || toDateStr(new Date()), bitisTarihi: endDate,
      demoBitisTarihi: durum === 'demo' ? endDate : '', fiyat: price, paraBirimi: 'TRY', kaynak: source,
      createdAt: subscription?.createdAt || Date.now(), updatedAt: Date.now(),
    });
  };

  const startTrial = async () => {
    if (subscription?.durum === 'aktif' || subscription?.durum === 'demo') { message.info(t('subscription.already')); return; }
    setSaving(true);
    try {
      const now = new Date();
      const tier = suggestedTier || PACKAGE_TIERS[0];
      await writeSubscription({ tier, selectedPeriod: 'demo', durum: 'demo', source: 'ilk_1_ay_ucretsiz', endDate: toDateStr(addMonths(now, 1)), price: 0 });
      message.success(t('subscription.trialStarted'));
    } catch {
      message.error(t('subscription.trialError'));
    } finally {
      setSaving(false);
    }
  };

  const applyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) { message.error(t('subscription.promoRequired')); return; }
    setSaving(true);
    try {
      const usageKey = `${kresId}_${code}`;
      const usageSnap = await get(ref(database, `promosyonKullanimlari/${usageKey}`));
      if (usageSnap.exists()) { message.warning(t('subscription.promoUsed')); setSaving(false); return; }

      let promo = BUILT_IN_PROMOS[code] || null;
      // NOT: promosyonKodlari node'u sadece süper admin tarafından okunabiliyor
      // (bkz. database.rules.json) — bu yüzden kayıtlı kodlar sadece
      // BUILT_IN_PROMOS listesinden kontrol edilebiliyor, mobille aynı kısıt.
      if (!promo || promo.aktif === false) { message.error(t('subscription.promoInvalid')); setSaving(false); return; }

      const months = Math.min(Number(promo.sureAy || 1), 1);
      const now = new Date();
      const currentEnd = getSubscriptionEndDate(subscription);
      const startBase = currentEnd && currentEnd > now ? currentEnd : now;
      const end = addMonths(startBase, months);
      const tier = suggestedTier || PACKAGE_TIERS[0];

      await writeSubscription({ tier, selectedPeriod: 'demo', durum: 'demo', source: `promo_${code}`, endDate: toDateStr(end), price: 0 });
      await set(ref(database, `promosyonKullanimlari/${usageKey}`), { kresId, kod: code, kullaniciId: kullanici?.uid || kullanici?.id || '', kullanildiAt: Date.now(), verilenAy: months });

      message.success(t('subscription.promoApplied', { months }));
      setPromoCode('');
    } catch {
      message.error(t('subscription.promoError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>{t('subscription.title')}</Title>
      <Text type="secondary">{t('subscription.subtitle')}</Text>

      <Alert
        type="info"
        showIcon
        style={{ margin: '16px 0' }}
        message={t('subscription.mobilePurchase')}
        description={t('subscription.mobileDesc')}
      />

      <Card style={{ marginBottom: 16, borderColor: THEME.border }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>{t('subscription.current')}</Text>
            <div><Text strong style={{ fontSize: 18 }}>{getPlanLabel(subscription, t)}</Text></div>
          </div>
          <Tag color={getStatusColor(status)}>{t(`subscription.status.${status.key}`, { days: status.remainingDays })}</Tag>
        </div>
        <Paragraph type="secondary" style={{ marginBottom: 8 }}>{status.key === 'expiring_soon' ? t('subscription.statusMsg.expiring_soon') : t(`subscription.statusMsg.${status.key}`)}</Paragraph>
        {status.remainingDays != null && <Text type="secondary">{t('subscription.remaining', { days: status.remainingDays })}</Text>}

        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontWeight: 700, fontSize: 13 }}>{t('subscription.usage')}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{studentCount} / {activeLimit || '-'}</Text>
          </div>
          <Progress percent={getUsagePercent(studentCount, activeLimit)} showInfo={false} strokeColor={overLimit ? THEME.red : THEME.primary} />
          {overLimit && <Text type="danger" style={{ fontSize: 12 }}>{t('subscription.overLimit')}</Text>}
        </div>

        {status.key === 'none' && (
          <Button type="primary" block loading={saving} onClick={startTrial} style={{ marginTop: 16 }}>{t('subscription.trial')}</Button>
        )}
      </Card>

      <Card style={{ marginBottom: 16, borderColor: THEME.border }} title={t('subscription.promo')}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder={t('subscription.promoPlaceholder') } style={{ flex: 1 }} />
          <Button type="primary" loading={saving} onClick={applyPromo}>{t('subscription.apply')}</Button>
        </div>
      </Card>

      <Title level={5} style={{ marginBottom: 12 }}>{t('subscription.packages')}</Title>
      <Row gutter={[12, 12]}>
        {PACKAGE_TIERS.map((tier) => (
          <Col xs={24} md={8} key={tier.id}>
            <Card style={{ borderColor: tier.featured ? tier.color : THEME.border, borderWidth: tier.featured ? 2 : 1 }}>
              <Tag color={tier.color}>{t(`subscription.tiers.${tier.id}.badge`)}</Tag>
              <Title level={4} style={{ margin: '8px 0 0' }}>{t(`subscription.tiers.${tier.id}.title`)}</Title>
              <Text type="secondary">{t(`subscription.tiers.${tier.id}.range`)}</Text>
              <Paragraph style={{ marginTop: 8, marginBottom: 8 }}>{t(`subscription.tiers.${tier.id}.desc`)}</Paragraph>
              <Text strong style={{ fontSize: 16 }}>{formatPrice(tier.monthly)} / {t('subscription.month')}</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>{formatPrice(tier.yearly)} / {t('subscription.year')}</Text></div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
