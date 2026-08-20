import React, { useEffect, useState } from 'react';
import { Typography, Row, Col, Card, Statistic, Spin } from 'antd';
import { ref, onValue } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';

const { Title, Text, Paragraph } = Typography;

const OZET_ITEMS = [
  { key: 'sinifSayisi', label: 'Sınıf', icon: '🏫', color: THEME.blue },
  { key: 'cocukSayisi', label: 'Çocuk', icon: '👶', color: THEME.orange },
  { key: 'ogretmenSayisi', label: 'Öğretmen', icon: '👨‍🏫', color: THEME.primary },
  { key: 'veliSayisi', label: 'Veli', icon: '👨‍👩‍👧', color: THEME.green },
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

  const [istatistik, setIstatistik] = useState(EMPTY_STATS);
  const [abonelik, setAbonelik] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);

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

  const adSoyad = `${kullanici?.ad || ''} ${kullanici?.soyad || ''}`.trim() || kullanici?.kullaniciAdi || 'Yönetici';

  return (
    <div>
      <div
        style={{
          background: THEME.primary,
          borderRadius: 20,
          padding: '20px 24px',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: 13 }}>Hoş Geldiniz 👋</Text>
          <Title level={3} style={{ color: '#fff', margin: '4px 0 0' }}>{adSoyad}</Title>
          <Text style={{ color: 'rgba(255,255,255,0.78)' }}>{getSubscriptionText(abonelik)}</Text>
        </div>
        <div style={{ fontSize: 36 }}>👑</div>
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
                <div style={{ fontSize: 26 }}>{item.icon}</div>
                <Statistic value={istatistik[item.key]} valueStyle={{ color: item.color, fontWeight: 900, fontSize: 22 }} />
                <Text type="secondary" style={{ fontWeight: 700, fontSize: 12 }}>{item.label}</Text>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Paragraph type="secondary" style={{ marginTop: 20 }}>
        {kres?.ad ? `${kres.ad} için özet bilgiler yukarıda. ` : ''}
        Detaylı analiz için sol menüden İstatistik sayfasına göz atabilirsin.
      </Paragraph>
    </div>
  );
}
