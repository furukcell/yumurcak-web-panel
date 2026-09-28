import React, { useEffect, useState } from 'react';
import { Typography, Row, Col, Card, Statistic, Spin, List, Empty, Tag, Progress } from 'antd';
import {
  ReadOutlined, SmileOutlined, TeamOutlined, ContactsOutlined, CrownOutlined,
  NotificationOutlined, CalendarOutlined, GiftOutlined, RightOutlined, WalletOutlined,
} from '@ant-design/icons';
import { ref, onValue, get, query, orderByChild, equalTo } from 'firebase/database';
import { useNavigate } from 'react-router-dom';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME, cardStyle } from '../theme';
import { parseChildBirthDate } from '../utils/childDates';
import { useUnreadMessagesCount } from '../utils/messageHelpers';
import { getSubscriptionStatus } from '../utils/subscriptionStatus';
import QuickActions from '../components/QuickActions';
import TodayCards from '../components/TodayCards';
import DailySummary from '../components/DailySummary';
import { useTranslation } from 'react-i18next';
import './DashboardPage.css';

const { Title, Text, Paragraph } = Typography;

function safeObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function toNumber(value) {
  if (typeof value === 'number') return value;
  const clean = String(value || '0').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}
function formatMoney(value, locale = 'tr-TR') {
  const number = toNumber(value);
  return number > 0 ? `${number.toLocaleString(locale)} ₺` : '-';
}
function normalizeDurum(item = {}) {
  const v = String(item.durum || item.status || '').toLowerCase().trim();
  if (['odendi', 'ödendi', 'paid', 'tamamlandi', 'tamamlandı'].includes(v)) return 'odendi';
  if (['gecikti', 'geçti', 'late', 'overdue'].includes(v)) return 'gecikti';
  const due = item.sonOdemeTarihi || item.dueDate;
  if (due && Date.parse(due) < Date.now()) return 'gecikti';
  return 'bekliyor';
}
function getChildName(cocuk = {}, odeme = {}, t) {
  return `${cocuk.ad || ''} ${cocuk.soyad || ''}`.trim() || cocuk.adSoyad || cocuk.isim || odeme.cocukAd || odeme.cocukAdi || odeme.childName || t('dashboard.childFallback');
}
function getMonthKey(o = {}) {
  if (o.tarih && String(o.tarih).length >= 7) return String(o.tarih).slice(0, 7);
  const yil = Number(o.yil || o.year);
  const ay = Number(o.ay || o.month);
  if (yil && ay) return `${yil}-${String(ay).padStart(2, '0')}`;
  return '';
}

const OZET_ITEMS = [
  { key: 'sinifSayisi', labelKey: 'classes', icon: <ReadOutlined />, color: THEME.blue, route: '/siniflar' },
  { key: 'cocukSayisi', labelKey: 'children', icon: <SmileOutlined />, color: THEME.orange, route: '/cocuklar' },
  { key: 'ogretmenSayisi', labelKey: 'teachers', icon: <TeamOutlined />, color: THEME.primary, route: '/ogretmenler' },
  { key: 'veliSayisi', labelKey: 'parents', icon: <ContactsOutlined />, color: THEME.green, route: '/veliler' },
];

const EMPTY_STATS = {
  sinifSayisi: 0,
  cocukSayisi: 0,
  ogretmenSayisi: 0,
  veliSayisi: 0,
};

// Boş/olmayan index "yüklenmedi" değil "0" olarak sayılır (mobil ile aynı
// FAZ 19 düzeltmesi — bkz. mobil DashboardScreen.js).
function countIndex(data) {
  if (!data || typeof data !== 'object') return 0;
  return Object.values(data).filter((value) => value !== false && value !== null).length;
}

function hasSummaryCounts(data) {
  if (!data || typeof data !== 'object') return false;
  return ['sinifSayisi', 'cocukSayisi', 'ogretmenSayisi', 'veliSayisi'].some((key) => typeof data[key] === 'number');
}

function normalizeStats(data = {}) {
  return {
    sinifSayisi: Number(data.sinifSayisi || 0),
    cocukSayisi: Number(data.cocukSayisi || 0),
    ogretmenSayisi: Number(data.ogretmenSayisi || 0),
    veliSayisi: Number(data.veliSayisi || 0),
  };
}

// utils/subscriptionStatus.js'deki getSubscriptionStatus()'un ürettiği
// remainingDays'i banner metnine ekleyen web'e özgü küçük yardımcı.
function getSubscriptionBannerText(sub, status, t) {
  if (!sub) return t('dashboard.freeTrial');
  if (status.key === 'expired') return t('dashboard.subscriptionExpired');

  const isDemo = String(sub.durum || sub.status || '').toLowerCase().includes('demo');
  if (isDemo) {
    return status.remainingDays != null ? t('dashboard.demoDays', { days: status.remainingDays }) : t('dashboard.demoActive');
  }
  if (status.aktif) {
    const planText = sub.plan === 'yillik' ? t('dashboard.annualActive') : t('dashboard.monthlyActive');
    return status.remainingDays != null ? t('dashboard.subscriptionDays', { plan: planText, days: status.remainingDays }) : planText;
  }
  return status.message || t('dashboard.subscriptionCheck');
}

// Mobildeki DashboardScreen.js'deki özet kart mantığının web karşılığı:
// önce kresOzetleri/{kresId} okunur (Cloud Function tarafından
// hesaplanmış toplu sayılar); orada rakam yoksa canlı index node'larından
// (kresSiniflari, kresCocuklari, kresKullanicilari/...) sayılır.
export default function DashboardPage() {
  const { kullanici, kres } = useAuth();
  const { t, i18n } = useTranslation();
  const kresId = kullanici?.kresId || 'kres001';
  const navigate = useNavigate();
  const unreadMessages = useUnreadMessagesCount(kullanici?.uid || kullanici?.id);

  const [istatistik, setIstatistik] = useState(EMPTY_STATS);
  const [abonelik, setAbonelik] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  const [duyurular, setDuyurular] = useState([]);
  const [etkinlikler, setEtkinlikler] = useState([]);
  const [dogumGunleri, setDogumGunleri] = useState([]);
  const [bekleyenOdemeler, setBekleyenOdemeler] = useState([]);
  const [ozetYukleniyor, setOzetYukleniyor] = useState(true);
  const [doluluk, setDoluluk] = useState({ toplamKapasite: 0, kapasiteGirilenSinif: 0 });
  const [gelirTrendi, setGelirTrendi] = useState([]);

  useEffect(() => {
    const subUnsub = onValue(ref(database, `abonelikler/${kresId}`), (snap) => {
      setAbonelik(snap.val() || null);
    });

    let summaryActive = false;
    const indexCounts = {
      sinifSayisi: 0,
      cocukSayisi: 0,
      ogretmenSayisi: 0,
      veliSayisi: 0,
    };

    const publishIndexCounts = () => {
      if (summaryActive) return;
      setIstatistik({ ...indexCounts });
      setYukleniyor(false);
    };

    // NOT: kresOzetleri sadece Cloud Function servis hesabı tarafından
    // okunabiliyor (bkz. database.rules.json), normal admin/yönetici
    // rolü bu node'u okuyamaz — bu yüzden pratikte her zaman aşağıdaki
    // canlı index fallback'i devreye girer. Mobil ile aynı davranış.
    const summaryUnsub = onValue(
      ref(database, `kresOzetleri/${kresId}`),
      (snap) => {
        const data = snap.val();
        if (hasSummaryCounts(data)) {
          summaryActive = true;
          setIstatistik(normalizeStats(data));
          setYukleniyor(false);
          return;
        }
        summaryActive = false;
        publishIndexCounts();
      },
      () => {
        // İzin reddi bekleniyor (bkz. yukarıdaki not) — sessizce fallback'e geç.
        summaryActive = false;
        publishIndexCounts();
      }
    );

    const indexListeners = [
      ['sinifSayisi', `kresSiniflari/${kresId}`],
      ['cocukSayisi', `kresCocuklari/${kresId}`],
      ['ogretmenSayisi', `kresKullanicilari/${kresId}/ogretmenler`],
      ['veliSayisi', `kresKullanicilari/${kresId}/veliler`],
    ].map(([key, path]) =>
      onValue(ref(database, path), (snap) => {
        indexCounts[key] = countIndex(snap.val());
        publishIndexCounts();
      })
    );

    return () => {
      subUnsub();
      summaryUnsub();
      indexListeners.forEach((unsub) => unsub && unsub());
    };
  }, [kresId]);

  // Bugünkü Özet: son duyurular + yaklaşan etkinlikler + yaklaşan doğum
  // günleri. Sayfalardaki (Announcements/Events/BirthdayCalendar) aynı
  // Firebase yollarını okur, sadece burada en yakın 3 kayıt gösterilir.
  useEffect(() => {
    if (!kresId) { setOzetYukleniyor(false); return; }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const duyuruUnsub = onValue(
      query(ref(database, 'duyurular'), orderByChild('kresId'), equalTo(kresId)),
      (snap) => {
        const data = snap.val();
        const list = data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [];
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setDuyurular(list.slice(0, 3));
      },
      () => setDuyurular([])
    );

    const etkinlikUnsub = onValue(
      query(ref(database, 'etkinlikler'), orderByChild('kresId'), equalTo(kresId)),
      (snap) => {
        const data = snap.val();
        const list = data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [];
        const upcoming = list
          .filter((e) => e.aktif !== false)
          .map((e) => ({ ...e, _date: parseChildBirthDate(e.tarih) }))
          .filter((e) => e._date && e._date >= today)
          .sort((a, b) => a._date - b._date);
        setEtkinlikler(upcoming.slice(0, 3));
      },
      () => setEtkinlikler([])
    );

    const cocukIndexUnsub = onValue(
      ref(database, `kresCocuklari/${kresId}`),
      async (snap) => {
        const idsData = snap.val();
        if (!idsData) { setDogumGunleri([]); setOzetYukleniyor(false); return; }
        const ids = Object.keys(idsData);
        const results = await Promise.all(
          ids.map((id) => get(ref(database, `cocuklar/${id}`)).then((s) => (s.exists() ? { id, ...s.val() } : null)))
        );
        const withNextBirthday = results
          .filter(Boolean)
          .map((child) => {
            const birth = parseChildBirthDate(child.dogumTarihi);
            if (!birth) return null;
            const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
            if (next < today) next.setFullYear(next.getFullYear() + 1);
            return { id: child.id, ad: `${child.ad || ''} ${child.soyad || ''}`.trim(), next, gunKala: Math.round((next - today) / 86400000) };
          })
          .filter(Boolean)
          .sort((a, b) => a.next - b.next);
        setDogumGunleri(withNextBirthday.slice(0, 3));
        setOzetYukleniyor(false);
      },
      () => setOzetYukleniyor(false)
    );

    return () => { duyuruUnsub(); etkinlikUnsub(); cocukIndexUnsub(); };
  }, [kresId]);

  // Bekleyen Ödemeler: PaymentsPage'deki aynı mantık — odemeler + cocuklar
  // join edilip durum='odendi' olmayanlar (bekliyor/gecikti) en eskiden
  // yeniye sıralanıp ilk 3'ü gösterilir.
  useEffect(() => {
    if (!kresId) return;
    let odemelerData = {};
    let childrenData = {};
    let odemelerLoaded = false;
    let childrenLoaded = false;

    function build() {
      if (!odemelerLoaded || !childrenLoaded) return;
      const liste = Object.entries(odemelerData)
        .map(([id, o]) => ({ id, ...safeObject(o) }))
        .filter((o) => !o.kresId || o.kresId === kresId || o.kurumId === kresId)
        .map((o) => {
          const cocuk = safeObject(childrenData[o.cocukId] || childrenData[o.childId]);
          return {
            id: o.id,
            durum: normalizeDurum(o),
            cocukAd: getChildName(cocuk, o, t),
            tutar: formatMoney(o.tutar || o.amount, i18n.language),
            monthKey: getMonthKey(o),
          };
        })
        .filter((o) => o.durum !== 'odendi')
        .sort((a, b) => (a.monthKey || '9999').localeCompare(b.monthKey || '9999'));
      setBekleyenOdemeler(liste.slice(0, 3));

      // Aylık gelir trendi: son 6 ay, sadece durum='odendi' olan ödemelerin
      // toplamı (ay = ödemenin ait olduğu dönem, `tarih`/`ay`+`yil` alanı).
      const now = new Date();
      const aylar = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString(i18n.language, { month: 'short' }) };
      });
      const odenenler = Object.values(odemelerData)
        .map((o) => safeObject(o))
        .filter((o) => (!o.kresId || o.kresId === kresId || o.kurumId === kresId) && normalizeDurum(o) === 'odendi');
      const trend = aylar.map(({ key, label }) => ({
        ay: label,
        tutar: odenenler.filter((o) => getMonthKey(o) === key).reduce((sum, o) => sum + toNumber(o.tutar || o.amount), 0),
      }));
      setGelirTrendi(trend);
    }

    const odemelerUnsub = onValue(
      query(ref(database, 'odemeler'), orderByChild('kresId'), equalTo(kresId)),
      (snap) => { odemelerData = safeObject(snap.val()); odemelerLoaded = true; build(); },
      () => { odemelerLoaded = true; build(); }
    );
    const childrenUnsub = onValue(
      query(ref(database, 'cocuklar'), orderByChild('kresId'), equalTo(kresId)),
      (snap) => { childrenData = safeObject(snap.val()); childrenLoaded = true; build(); },
      () => { childrenLoaded = true; build(); }
    );

    return () => { odemelerUnsub(); childrenUnsub(); };
  }, [kresId, i18n.language]);

  // Doluluk oranı: sınıflardaki `kapasite` alanlarının toplamı (bkz.
  // ClassesPage.jsx). Kapasite girilmemiş sınıflar toplamı etkilemez —
  // hiçbirinde girilmemişse kart "kapasite girilmemiş" durumunu gösterir.
  useEffect(() => {
    if (!kresId) return;
    const unsub = onValue(
      query(ref(database, 'siniflar'), orderByChild('kresId'), equalTo(kresId)),
      (snap) => {
        const list = Object.values(safeObject(snap.val()));
        const kapasiteliler = list.filter((s) => Number(s.kapasite) > 0);
        setDoluluk({
          toplamKapasite: kapasiteliler.reduce((sum, s) => sum + Number(s.kapasite), 0),
          kapasiteGirilenSinif: kapasiteliler.length,
        });
      },
      () => setDoluluk({ toplamKapasite: 0, kapasiteGirilenSinif: 0 })
    );
    return () => unsub();
  }, [kresId]);

  const adSoyad = `${kullanici?.ad || ''} ${kullanici?.soyad || ''}`.trim() || kullanici?.kullaniciAdi || t('common.administrator');
  const subStatus = getSubscriptionStatus(abonelik);
  const subUrgent = subStatus.key === 'expiring_soon' || subStatus.key === 'expired';

  const todayLabel = new Date().toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
  const dolulukOrani = doluluk.toplamKapasite > 0 ? Math.round((istatistik.cocukSayisi / doluluk.toplamKapasite) * 100) : 0;
  const kpiItems = [
    { key:'sinifSayisi', label:t('navigation.classes'), hint:t('dashboard.kpiClassesHint',{count:istatistik.sinifSayisi}), icon:<ReadOutlined />, color:'#2872d7', soft:'#edf5ff', route:'/siniflar' },
    { key:'cocukSayisi', label:t('navigation.children'), hint:t('dashboard.kpiChildrenHint',{count:istatistik.cocukSayisi}), icon:<SmileOutlined />, color:'#df8a18', soft:'#fff5e8', route:'/cocuklar' },
    { key:'ogretmenSayisi', label:t('navigation.teachers'), hint:t('dashboard.kpiTeachersHint',{count:istatistik.ogretmenSayisi}), icon:<TeamOutlined />, color:'#6c3deb', soft:'#f0eaff', route:'/ogretmenler' },
    { key:'veliSayisi', label:t('navigation.parents'), hint:t('dashboard.kpiParentsHint',{count:istatistik.veliSayisi}), icon:<ContactsOutlined />, color:'#16935b', soft:'#ecfbf3', route:'/veliler' },
  ];

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-content">
          <div>
            <div className="dashboard-kicker">{t('dashboard.welcome')} 👋</div>
            <Title className="dashboard-hero-title">{adSoyad}</Title>
            <span className="dashboard-hero-subtitle">{kres?.ad || 'Yumurcak Kreş'} · {t('dashboard.dailySummary')}</span>
          </div>
          <div className="dashboard-hero-side">
            <div className="dashboard-hero-stat"><div className="dashboard-hero-stat-label">{todayLabel}</div><div className="dashboard-hero-stat-value">{t('dashboard.today')}</div></div>
            <div className="dashboard-hero-stat"><div className="dashboard-hero-stat-label">{t('common.todayCapacity')}</div><div className="dashboard-hero-stat-value">{istatistik.cocukSayisi} / {doluluk.toplamKapasite || '—'} · %{dolulukOrani}</div></div>
          </div>
        </div>
      </section>

      <div className="dashboard-actions">
        <div className="dashboard-action-label">{t('common.quickActions')}</div>
        <button className="dashboard-action-btn dashboard-action-primary" onClick={() => navigate('/duyurular')}>＋ {t('common.quickAnnouncements')}</button>
        <button className="dashboard-action-btn dashboard-action-blue" onClick={() => navigate('/etkinlikler')}>＋ {t('dashboard.upcomingEvents')}</button>
        <button className="dashboard-action-btn dashboard-action-green" onClick={() => navigate('/cocuklar')}>＋ {t('navigation.children')}</button>
        <button className="dashboard-action-btn dashboard-action-orange" onClick={() => navigate('/mesajlar')}>➤ {t('common.quickMessages')}</button>
      </div>

      {yukleniyor ? <div style={{textAlign:'center',padding:40}}><Spin size="large" /></div> : (
        <div className="dashboard-kpis">
          {kpiItems.map((item) => <div key={item.key} className="dashboard-kpi" style={{'--kpi-color':item.color,'--kpi-soft':item.soft}} onClick={() => navigate(item.route)}>
            <div className="dashboard-kpi-top"><div className="dashboard-kpi-icon">{item.icon}</div><RightOutlined style={{color:'#aaa5ba',fontSize:11}} /></div>
            <div className="dashboard-kpi-number">{istatistik[item.key]}</div><div className="dashboard-kpi-label">{item.label}</div><div className="dashboard-kpi-hint">{item.hint}</div>
          </div>)}
        </div>
      )}

      <div className="dashboard-section-label"><span style={{fontSize:20}}>☀️</span><div><h3>{t('dashboard.dailySummary')}</h3><span>{todayLabel}</span></div></div>
      <DailySummary navigate={navigate} kresId={kresId} />

      <div className="dashboard-section-label"><span style={{fontSize:20}}>⚡</span><div><h3>{t('dashboard.attention')}</h3><span>{t('dashboard.today')}</span></div></div>
      <div className="dashboard-alert-grid">
        <div className="dashboard-alert dashboard-alert-red" onClick={() => navigate('/ayarlar/kurum-zili')}><div className="dashboard-alert-icon" style={{background:'#ffe3e8',color:'#e84b63'}}>♧</div><div><div className="dashboard-alert-title">{t('common.quickInstitutionBell')} {unreadMessages > 0 ? '· ' + unreadMessages : ''}</div><div className="dashboard-alert-value">{t('dashboard.noNotificationsToday')}</div></div></div>
        <div className="dashboard-alert dashboard-alert-gold" onClick={() => navigate('/odemeler')}><div className="dashboard-alert-icon" style={{background:'#ffedc7',color:'#df8a18'}}>₺</div><div><div className="dashboard-alert-title">{t('dashboard.pendingPayments')}</div><div className="dashboard-alert-value">{bekleyenOdemeler.length ? t('dashboard.pendingCount',{count:bekleyenOdemeler.length}) : t('dashboard.noPendingPayments')}</div></div></div>
        <div className="dashboard-alert dashboard-alert-blue" onClick={() => navigate('/istatistik')}><div className="dashboard-alert-icon" style={{background:'#dfeeff',color:'#2872d7'}}>▥</div><div><div className="dashboard-alert-title">{t('navigation.statistics')}</div><div className="dashboard-alert-value">%{dolulukOrani} {t('common.todayCapacity')}</div></div></div>
      </div>

      <div className="dashboard-section-label"><span style={{fontSize:20}}>▣</span><div><h3>{t('dashboard.recentAnnouncements')}</h3><span>{t('dashboard.upcomingEvents')}</span></div></div>
      <div className="dashboard-feed-grid">
        <div className="dashboard-feed-card"><div className="dashboard-feed-head"><div className="dashboard-feed-title">📣 {t('dashboard.recentAnnouncements')}</div><span className="dashboard-feed-link" onClick={() => navigate('/duyurular')}>{t('common.viewAll')} →</span></div>
          {ozetYukleniyor ? <div className="dashboard-feed-empty"><Spin size="small" /></div> : duyurular.length ? duyurular.map((d) => <div className="dashboard-feed-item" key={d.id}><span className="dashboard-feed-dot"/><div><div className="dashboard-feed-name">{d.title || d.baslik || t('dashboard.announcementFallback')}</div><div className="dashboard-feed-sub">{d.createdAt ? new Date(d.createdAt).toLocaleDateString(i18n.language) : ''}</div></div></div>) : <div className="dashboard-feed-empty">{t('dashboard.noAnnouncements')}</div>}
        </div>
        <div className="dashboard-feed-card"><div className="dashboard-feed-head"><div className="dashboard-feed-title">📅 {t('dashboard.upcomingEvents')}</div><span className="dashboard-feed-link" onClick={() => navigate('/etkinlikler')}>{t('common.viewAll')} →</span></div>
          {etkinlikler.length ? etkinlikler.map((e) => <div className="dashboard-feed-item" key={e.id}><span className="dashboard-feed-dot" style={{background:'#20b8a0'}}/><div><div className="dashboard-feed-name">{e.baslik || t('dashboard.eventFallback')}</div><div className="dashboard-feed-sub">{e.tarih || ''}{e.saat ? ' · ' + e.saat : ''}</div></div></div>) : <div className="dashboard-feed-empty">{t('dashboard.noUpcomingEvents')}</div>}
        </div>
        <div className="dashboard-feed-card"><div className="dashboard-feed-head"><div className="dashboard-feed-title">🎂 {t('dashboard.upcomingBirthdays')}</div><span className="dashboard-feed-link" onClick={() => navigate('/dogum-gunleri')}>{t('common.viewAll')} →</span></div>
          {dogumGunleri.length ? dogumGunleri.map((c) => <div className="dashboard-feed-item" key={c.id}><span className="dashboard-feed-dot" style={{background:'#e86ac5'}}/><div><div className="dashboard-feed-name">{c.ad || t('dashboard.childFallback')}</div><div className="dashboard-feed-sub">{c.gunKala === 0 ? t('dashboard.today') : c.gunKala === 1 ? t('dashboard.tomorrow') : t('dashboard.daysLater',{days:c.gunKala})}</div></div></div>) : <div className="dashboard-feed-empty">{t('dashboard.noUpcomingBirthdays')}</div>}
        </div>
        <div className="dashboard-feed-card"><div className="dashboard-feed-head"><div className="dashboard-feed-title">💳 {t('dashboard.pendingPayments')}</div><span className="dashboard-feed-link" onClick={() => navigate('/odemeler')}>{t('common.viewAll')} →</span></div>
          {bekleyenOdemeler.length ? bekleyenOdemeler.map((o) => <div className="dashboard-feed-item" key={o.id}><span className="dashboard-feed-dot" style={{background:o.durum==='gecikti'?'#ef536b':'#e7a52a'}}/><div><div className="dashboard-feed-name">{o.cocukAd}</div><div className="dashboard-feed-sub">{o.tutar} · {o.durum==='gecikti'?t('dashboard.late'):t('dashboard.pending')}</div></div></div>) : <div className="dashboard-payment-empty">{t('dashboard.noPendingPayments')}</div>}
        </div>
      </div>
    </div>
  );
}

// Dashboard'daki mini özet panelleri (duyurular / etkinlikler / doğum
// günleri / bekleyen ödemeler) için tekrar kullanılan kart bileşeni.
// Aylık gelir trendi: son 6 ayda tahsil edilmiş (durum='odendi') ödeme
// tutarlarının toplamı, basit dikey çubuk grafik — ekstra kütüphane
// gerekmesin diye salt div/CSS ile çizildi.
function RevenueTrendCard({ trend, onClick, t }) {
  const maxTutar = Math.max(1, ...trend.map((t) => t.tutar));
  const buAy = trend[trend.length - 1]?.tutar || 0;
  const oncekiAy = trend[trend.length - 2]?.tutar || 0;
  const fark = oncekiAy > 0 ? Math.round(((buAy - oncekiAy) / oncekiAy) * 100) : null;

  return (
    <Card style={{ ...cardStyle(THEME.gold), height: '100%', cursor: 'pointer' }} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <Text strong style={{ fontSize: 13 }}>{t('dashboard.monthlyRevenue')}</Text>
        {fark !== null && (
          <Tag color={fark >= 0 ? 'green' : 'red'}>{fark >= 0 ? '▲' : '▼'} %{Math.abs(fark)} {t('dashboard.vsLastMonth')}</Tag>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 90 }}>
        {trend.map((t, idx) => (
          <div key={t.ay + idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 10.5, color: THEME.muted, whiteSpace: 'nowrap' }}>
              {t.tutar > 0 ? `${Math.round(t.tutar / 1000)}b` : ''}
            </Text>
            <div
              style={{
                width: '100%',
                maxWidth: 34,
                height: Math.max(4, (t.tutar / maxTutar) * 64),
                borderRadius: 6,
                background: idx === trend.length - 1 ? THEME.gold : `${THEME.gold}55`,
              }}
            />
            <Text style={{ fontSize: 11, color: THEME.muted }}>{t.ay}</Text>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SummaryPanel({ title, icon, items, loading, emptyText, onSeeAll }) {
  return (
    <Card
      size="small"
      style={{ ...cardStyle(), height: '100%' }}
      styles={{ body: { padding: 16 } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 30, height: 30, borderRadius: 9,
              background: `${THEME.primary}1A`, color: THEME.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
            }}
          >
            {icon}
          </div>
          <Text strong style={{ fontSize: 13 }}>{title}</Text>
        </div>
        <RightOutlined
          onClick={onSeeAll}
          style={{ fontSize: 11, color: THEME.muted, cursor: 'pointer' }}
        />
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
      ) : items.length === 0 ? (
        <Empty
          description={<Text type="secondary" style={{ fontSize: 12 }}>{emptyText}</Text>}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '8px 0' }}
        />
      ) : (
        <List
          size="small"
          dataSource={items}
          split={false}
          renderItem={(item) => (
            <List.Item style={{ padding: '6px 0', border: 'none' }}>
              <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontWeight: 600, display: 'block' }} ellipsis>{item.primary}</Text>
                  {item.secondary && <Text type="secondary" style={{ fontSize: 11 }}>{item.secondary}</Text>}
                </div>
                {item.tag && (
                  <Tag color={item.tag.color} style={{ margin: 0, fontSize: 10, lineHeight: '16px', flexShrink: 0 }}>
                    {item.tag.text}
                  </Tag>
                )}
              </div>
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}
