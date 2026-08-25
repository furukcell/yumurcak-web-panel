import React, { useEffect, useState } from 'react';
import { Typography, Row, Col, Card, Statistic, Spin, List, Empty, Tag } from 'antd';
import {
  ReadOutlined, SmileOutlined, TeamOutlined, ContactsOutlined, CrownOutlined,
  NotificationOutlined, CalendarOutlined, GiftOutlined, RightOutlined, WalletOutlined,
} from '@ant-design/icons';
import { ref, onValue, get, query, orderByChild, equalTo } from 'firebase/database';
import { useNavigate } from 'react-router-dom';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { parseChildBirthDate } from '../utils/childDates';
import { useUnreadMessagesCount } from '../utils/messageHelpers';
import QuickActions from '../components/QuickActions';

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
  { key: 'sinifSayisi', label: 'Sınıf', icon: <ReadOutlined />, color: THEME.blue },
  { key: 'cocukSayisi', label: 'Çocuk', icon: <SmileOutlined />, color: THEME.orange },
  { key: 'ogretmenSayisi', label: 'Öğretmen', icon: <TeamOutlined />, color: THEME.primary },
  { key: 'veliSayisi', label: 'Veli', icon: <ContactsOutlined />, color: THEME.green },
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

function getSubscriptionText(sub) {
  if (!sub) return 'İlk 1 ay ücretsiz deneme';
  if (sub.durum === 'aktif') return sub.plan === 'yillik' ? 'Yıllık abonelik aktif' : 'Aylık abonelik aktif';
  if (sub.durum === 'demo') return `Demo aktif · ${sub.demoBitisTarihi || sub.bitisTarihi || ''}`;
  return 'Abonelik durumu kontrol edilmeli';
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

  const adSoyad = `${kullanici?.ad || ''} ${kullanici?.soyad || ''}`.trim() || kullanici?.kullaniciAdi || 'Yönetici';

  return (
    <div>
      <QuickActions navigate={navigate} kresId={kresId} unreadMessages={unreadMessages} />
      <div
        style={{
          background: `linear-gradient(135deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
          borderRadius: 20,
          padding: '20px 24px',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 14px 32px rgba(76, 41, 156, 0.22)',
        }}
      >
        <div>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: 13 }}>Hoş Geldiniz 👋</Text>
          <Title level={3} style={{ color: '#fff', margin: '4px 0 0' }}>{adSoyad}</Title>
          <Text style={{ color: 'rgba(255,255,255,0.78)' }}>{getSubscriptionText(abonelik)}</Text>
        </div>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            color: '#FFD97A',
          }}
        >
          <CrownOutlined />
        </div>
      </div>

      <Title level={5} style={{ marginBottom: 12 }}>Genel Özet</Title>
      {yukleniyor ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Row gutter={[12, 12]} style={{ marginBottom: 8 }}>
          {OZET_ITEMS.map((item) => (
            <Col xs={12} md={6} key={item.key}>
              <Card size="small" style={{ textAlign: 'center', borderColor: THEME.border }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: `${item.color}1A`,
                    color: item.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    margin: '0 auto 10px',
                  }}
                >
                  {item.icon}
                </div>
                <Statistic value={istatistik[item.key]} valueStyle={{ color: item.color, fontWeight: 900, fontSize: 22 }} />
                <Text type="secondary" style={{ fontWeight: 700, fontSize: 12 }}>{item.label}</Text>
              </Card>
            </Col>
          ))}
        </Row>
      )}

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
function SummaryPanel({ title, icon, color, items, loading, emptyText, onSeeAll }) {
  return (
    <Card
      size="small"
      style={{ borderColor: THEME.border, height: '100%' }}
      styles={{ body: { padding: 16 } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 30, height: 30, borderRadius: 9,
              background: `${color}1A`, color,
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
