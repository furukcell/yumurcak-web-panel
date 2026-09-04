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

const { Title, Text, Paragraph } = Typography;

function safeObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
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
function normalizeDurum(item = {}) {
  const v = String(item.durum || item.status || '').toLowerCase().trim();
  if (['odendi', 'ödendi', 'paid', 'tamamlandi', 'tamamlandı'].includes(v)) return 'odendi';
  if (['gecikti', 'geçti', 'late', 'overdue'].includes(v)) return 'gecikti';
  const due = item.sonOdemeTarihi || item.dueDate;
  if (due && Date.parse(due) < Date.now()) return 'gecikti';
  return 'bekliyor';
}
function getChildName(cocuk = {}, odeme = {}) {
  return `${cocuk.ad || ''} ${cocuk.soyad || ''}`.trim() || cocuk.adSoyad || cocuk.isim || odeme.cocukAd || odeme.cocukAdi || odeme.childName || 'Çocuk';
}
function getMonthKey(o = {}) {
  if (o.tarih && String(o.tarih).length >= 7) return String(o.tarih).slice(0, 7);
  const yil = Number(o.yil || o.year);
  const ay = Number(o.ay || o.month);
  if (yil && ay) return `${yil}-${String(ay).padStart(2, '0')}`;
  return '';
}

const OZET_ITEMS = [
  { key: 'sinifSayisi', label: 'Sınıf', icon: <ReadOutlined />, color: THEME.blue, route: '/siniflar' },
  { key: 'cocukSayisi', label: 'Çocuk', icon: <SmileOutlined />, color: THEME.orange, route: '/cocuklar' },
  { key: 'ogretmenSayisi', label: 'Öğretmen', icon: <TeamOutlined />, color: THEME.primary, route: '/ogretmenler' },
  { key: 'veliSayisi', label: 'Veli', icon: <ContactsOutlined />, color: THEME.green, route: '/veliler' },
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
function getSubscriptionBannerText(sub, status) {
  if (!sub) return 'İlk 1 ay ücretsiz deneme';
  if (status.key === 'expired') return 'Abonelik süresi doldu';

  const isDemo = String(sub.durum || sub.status || '').toLowerCase().includes('demo');
  if (isDemo) {
    return status.remainingDays != null ? `Demo aktif · ${status.remainingDays} gün kaldı` : 'Demo aktif';
  }
  if (status.aktif) {
    const planText = sub.plan === 'yillik' ? 'Yıllık abonelik aktif' : 'Aylık abonelik aktif';
    return status.remainingDays != null ? `${planText} · ${status.remainingDays} gün kaldı` : planText;
  }
  return status.message || 'Abonelik durumu kontrol edilmeli';
}

// Mobildeki DashboardScreen.js'deki özet kart mantığının web karşılığı:
// önce kresOzetleri/{kresId} okunur (Cloud Function tarafından
// hesaplanmış toplu sayılar); orada rakam yoksa canlı index node'larından
// (kresSiniflari, kresCocuklari, kresKullanicilari/...) sayılır.
export default function DashboardPage() {
  const { kullanici, kres } = useAuth();
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
            cocukAd: getChildName(cocuk, o),
            tutar: formatMoney(o.tutar || o.amount),
            monthKey: getMonthKey(o),
          };
        })
        .filter((o) => o.durum !== 'odendi')
        .sort((a, b) => (a.monthKey || '9999').localeCompare(b.monthKey || '9999'));
      setBekleyenOdemeler(liste.slice(0, 3));

      // Aylık gelir trendi: son 6 ay, sadece durum='odendi' olan ödemelerin
      // toplamı (ay = ödemenin ait olduğu dönem, `tarih`/`ay`+`yil` alanı).
      const now = new Date();
      const ayEtiketleri = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
      const aylar = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: ayEtiketleri[d.getMonth()] };
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
  }, [kresId]);

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

  const adSoyad = `${kullanici?.ad || ''} ${kullanici?.soyad || ''}`.trim() || kullanici?.kullaniciAdi || 'Yönetici';
  const subStatus = getSubscriptionStatus(abonelik);
  const subUrgent = subStatus.key === 'expiring_soon' || subStatus.key === 'expired';

  return (
    <div>
      {/* Karşılama kartı: sağ üstte artık dekoratif bir ikon kutusu yok —
          onun yerine hızlı erişim şeridi geldi, böylece aynı satır hem
          selamlıyor hem de sık kullanılan sayfalara götürüyor. */}
      <div
        style={{
          background: `linear-gradient(135deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
          borderRadius: 20,
          padding: '22px 26px',
          marginBottom: 16,
          boxShadow: '0 14px 32px rgba(76, 41, 156, 0.20)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontSize: 13 }}>Hoş geldiniz</Text>
            <Title level={3} style={{ color: '#fff', margin: '2px 0 0' }}>{adSoyad}</Title>
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 14px',
              borderRadius: 999,
              background: subUrgent ? (subStatus.key === 'expired' ? 'rgba(255,77,109,0.24)' : 'rgba(255,159,28,0.24)') : 'rgba(255,255,255,0.14)',
              cursor: 'pointer',
            }}
            onClick={() => navigate('/ayarlar/abonelik')}
          >
            <CrownOutlined style={{ color: '#FFD97A', fontSize: 14 }} />
            <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: 700 }}>
              {subUrgent
                ? (subStatus.key === 'expired' ? 'Abonelik yenilenmeli' : `${subStatus.remainingDays} gün kaldı, yenile`)
                : getSubscriptionBannerText(abonelik, subStatus)}
            </Text>
          </div>
        </div>
      </div>

      <QuickActions navigate={navigate} kresId={kresId} unreadMessages={unreadMessages} doluluk={doluluk} toplamCocuk={istatistik.cocukSayisi} />

      {/* Genel Özet: dört sayı artık dört ayrı kart değil, tek bir panelin
          içinde ince dikey çizgilerle bölünmüş sütunlar — sayfadaki tekrar
          eden "renkli daire ikon" kartlarının sayısını azaltıp asıl
          rakamlara daha fazla ağırlık veriyor. */}
      {yukleniyor ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            border: `1px solid ${THEME.border}`,
            borderRadius: THEME.radius,
            background: THEME.card,
            marginBottom: 16,
            boxShadow: THEME.shadow,
          }}
        >
          {OZET_ITEMS.map((item, idx) => (
            <div
              key={item.key}
              onClick={() => navigate(item.route)}
              style={{
                flex: '1 1 140px',
                padding: '18px 22px',
                borderRight: idx < OZET_ITEMS.length - 1 ? `1px solid ${THEME.border}` : 'none',
                borderBottom: `3px solid ${item.color}`,
                borderBottomLeftRadius: idx === 0 ? THEME.radius : 0,
                borderBottomRightRadius: idx === OZET_ITEMS.length - 1 ? THEME.radius : 0,
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${item.color}0D`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: item.color }}>{item.icon}</span>
                <Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>{item.label}</Text>
              </div>
              <Text style={{ fontSize: 26, fontWeight: 800, color: THEME.text, lineHeight: 1 }}>
                {istatistik[item.key]}
              </Text>
            </div>
          ))}
        </div>
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <RevenueTrendCard trend={gelirTrendi} onClick={() => navigate('/odemeler')} />
        </Col>
      </Row>

      <TodayCards navigate={navigate} kresId={kresId} />

      <DailySummary navigate={navigate} kresId={kresId} />

      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        <Col xs={24} sm={12} md={6}>
          <SummaryPanel
            title="Son Duyurular"
            icon={<NotificationOutlined />}
            color={THEME.red}
            loading={ozetYukleniyor}
            emptyText="Henüz duyuru yok"
            onSeeAll={() => navigate('/duyurular')}
            items={duyurular.map((d) => ({
              key: d.id,
              primary: d.title || d.baslik || 'Duyuru',
              secondary: [d.senderName, d.createdAt ? new Date(d.createdAt).toLocaleDateString('tr-TR') : ''].filter(Boolean).join(' · '),
            }))}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <SummaryPanel
            title="Yaklaşan Etkinlikler"
            icon={<CalendarOutlined />}
            color={THEME.teal}
            loading={ozetYukleniyor}
            emptyText="Yaklaşan etkinlik yok"
            onSeeAll={() => navigate('/etkinlikler')}
            items={etkinlikler.map((e) => ({
              key: e.id,
              primary: e.baslik || 'Etkinlik',
              secondary: `${e.tarih || ''}${e.saat ? ' · ' + e.saat : ''}`,
            }))}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <SummaryPanel
            title="Yaklaşan Doğum Günleri"
            icon={<GiftOutlined />}
            color={THEME.gold}
            loading={ozetYukleniyor}
            emptyText="Yaklaşan doğum günü yok"
            onSeeAll={() => navigate('/dogum-gunleri')}
            items={dogumGunleri.map((c) => ({
              key: c.id,
              primary: c.ad || 'Çocuk',
              secondary: c.gunKala === 0 ? 'Bugün 🎉' : c.gunKala === 1 ? 'Yarın' : `${c.gunKala} gün sonra`,
            }))}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <SummaryPanel
            title="Bekleyen Ödemeler"
            icon={<WalletOutlined />}
            color={THEME.orange}
            loading={ozetYukleniyor}
            emptyText="Bekleyen ödeme yok 🎉"
            onSeeAll={() => navigate('/odemeler')}
            items={bekleyenOdemeler.map((o) => ({
              key: o.id,
              primary: o.cocukAd,
              secondary: o.tutar,
              tag: o.durum === 'gecikti'
                ? { text: 'Gecikti', color: THEME.red }
                : { text: 'Bekliyor', color: THEME.orange },
            }))}
          />
        </Col>
      </Row>

      <Paragraph type="secondary" style={{ marginTop: 20 }}>
        {kres?.ad ? `${kres.ad} için özet bilgiler yukarıda. ` : ''}
        Detaylı analiz için sol menüden İstatistik sayfasına göz atabilirsin.
      </Paragraph>
    </div>
  );
}

// Dashboard'daki mini özet panelleri (duyurular / etkinlikler / doğum
// günleri / bekleyen ödemeler) için tekrar kullanılan kart bileşeni.
// Aylık gelir trendi: son 6 ayda tahsil edilmiş (durum='odendi') ödeme
// tutarlarının toplamı, basit dikey çubuk grafik — ekstra kütüphane
// gerekmesin diye salt div/CSS ile çizildi.
function RevenueTrendCard({ trend, onClick }) {
  const maxTutar = Math.max(1, ...trend.map((t) => t.tutar));
  const buAy = trend[trend.length - 1]?.tutar || 0;
  const oncekiAy = trend[trend.length - 2]?.tutar || 0;
  const fark = oncekiAy > 0 ? Math.round(((buAy - oncekiAy) / oncekiAy) * 100) : null;

  return (
    <Card style={{ ...cardStyle(THEME.gold), height: '100%', cursor: 'pointer' }} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <Text strong style={{ fontSize: 13 }}>💰 Aylık Gelir Trendi</Text>
        {fark !== null && (
          <Tag color={fark >= 0 ? 'green' : 'red'}>{fark >= 0 ? '▲' : '▼'} %{Math.abs(fark)} geçen aya göre</Tag>
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
