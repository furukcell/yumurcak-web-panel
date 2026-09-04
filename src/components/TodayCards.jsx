import React, { useEffect, useState } from 'react';
import { Card, Typography, Spin, Progress } from 'antd';
import { SolutionOutlined, BellOutlined } from '@ant-design/icons';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { todayDateKey } from '../services/monthlyDocuments';
import { THEME } from '../theme';

const { Text } = Typography;

// Bugünkü nöbetçi öğretmen — nobetCizelgeleri/{id}.tarih alanı Nöbet
// Çizelgesi sayfasıyla aynı 'YYYY-MM-DD' formatında (bkz. DutyRosterPage +
// monthlyDocuments.js), o yüzden aynı todayDateKey() ile eşleştiriyoruz.
function useTodayDuty(kresId) {
  const [personel, setPersonel] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!kresId) { setPersonel(null); setLoading(false); return undefined; }
    const today = todayDateKey();
    const q = query(ref(database, 'nobetCizelgeleri'), orderByChild('kresId'), equalTo(kresId));
    const unsub = onValue(
      q,
      (snap) => {
        const data = snap.val() || {};
        const match = Object.values(data).find(
          (r) => r.tarih === today && r.aktif !== false && String(r.personel || '').trim()
        );
        setPersonel(match ? match.personel : null);
        setLoading(false);
      },
      () => { setPersonel(null); setLoading(false); }
    );
    return unsub;
  }, [kresId]);
  return { personel, loading };
}

// Bugün kurumZili altına düşen (veli "kapıdayım"/"geliyorum" bildirimi)
// kayıt sayısı + kaçının tamamlandığı. Not: bu bir devam/yoklama sistemi
// DEĞİL — sadece bugünkü bırakma/alma bildirim hareketliliği.
function useTodayBell(kresId) {
  const [stats, setStats] = useState({ toplam: 0, tamamlanan: 0 });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!kresId) { setStats({ toplam: 0, tamamlanan: 0 }); setLoading(false); return undefined; }
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const q = query(ref(database, 'kurumZili'), orderByChild('kresId'), equalTo(kresId));
    const unsub = onValue(
      q,
      (snap) => {
        const data = snap.val() || {};
        const bugun = Object.values(data).filter((i) => Number(i.createdAt || i.updatedAt || 0) >= startOfDay.getTime());
        const tamamlanan = bugun.filter((i) => i.tamamlandi || i.tamamlandı).length;
        setStats({ toplam: bugun.length, tamamlanan });
        setLoading(false);
      },
      () => { setStats({ toplam: 0, tamamlanan: 0 }); setLoading(false); }
    );
    return unsub;
  }, [kresId]);
  return { ...stats, loading };
}

function TodayCard({ icon, color, title, loading, children, onClick }) {
  return (
    <Card
      size="small"
      hoverable
      onClick={onClick}
      style={{ borderColor: THEME.border, height: '100%', cursor: 'pointer' }}
      styles={{ body: { padding: 14 } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${color}1A`,
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 17,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, display: 'block' }}>{title}</Text>
          {loading ? <Spin size="small" /> : children}
        </div>
      </div>
    </Card>
  );
}

// Kurum doluluk oranı: mevcut çocuk sayısı / sınıflara girilmiş toplam
// kapasite. Diğer TodayCard'lar gibi tıklanabilir (sınıflar sayfasına
// götürür) ama içerik dikdörtgen metin yerine dairesel Progress —
// ilk bakışta doluluk seviyesini renkle de anlatmak için.
function DolulukCard({ doluluk, toplamCocuk, navigate }) {
  const toplamKapasite = doluluk?.toplamKapasite || 0;
  const kapasiteGirilmemis = toplamKapasite <= 0;
  const oran = kapasiteGirilmemis ? 0 : Math.round((toplamCocuk / toplamKapasite) * 100);
  const renk = oran >= 100 ? THEME.red : oran >= 80 ? THEME.orange : THEME.green;

  return (
    <Card
      size="small"
      hoverable
      onClick={() => navigate('/siniflar')}
      style={{ borderColor: THEME.border, height: '100%', cursor: 'pointer' }}
      styles={{ body: { padding: 14 } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Progress
          type="circle"
          percent={kapasiteGirilmemis ? 0 : Math.min(oran, 100)}
          size={36}
          strokeColor={renk}
          strokeWidth={10}
          format={() => (
            <span style={{ fontSize: 10, fontWeight: 800, color: kapasiteGirilmemis ? THEME.muted : renk }}>
              {kapasiteGirilmemis ? '-' : `%${oran}`}
            </span>
          )}
        />
        <div style={{ minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, display: 'block' }}>KURUM DOLULUK ORANI</Text>
          <Text strong style={{ fontSize: 14 }}>
            {kapasiteGirilmemis ? 'Kapasite girilmemiş' : `${toplamCocuk} / ${toplamKapasite} çocuk`}
          </Text>
        </div>
      </div>
    </Card>
  );
}

// Dashboard'daki "Genel Özet" (toplam sayılar) ile karşılama kartı
// arasına giren, o günün operasyonel durumunu gösteren kart şeridi.
export default function TodayCards({ navigate, kresId, doluluk, toplamCocuk }) {
  const { personel, loading: dutyLoading } = useTodayDuty(kresId);
  const { toplam, tamamlanan, loading: bellLoading } = useTodayBell(kresId);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
      <TodayCard
        icon={<SolutionOutlined />}
        color={THEME.gold}
        title="BUGÜNKÜ NÖBETÇİ"
        loading={dutyLoading}
        onClick={() => navigate('/nobet-cizelgesi')}
      >
        <Text strong style={{ fontSize: 14 }}>{personel || 'Henüz atanmadı'}</Text>
      </TodayCard>
      <TodayCard
        icon={<BellOutlined />}
        color={THEME.red}
        title="BUGÜN KURUM ZİLİ"
        loading={bellLoading}
        onClick={() => navigate('/ayarlar/kurum-zili')}
      >
        <Text strong style={{ fontSize: 14 }}>
          {toplam === 0 ? 'Henüz bildirim yok' : `${toplam} bildirim · ${tamamlanan} tamamlandı`}
        </Text>
      </TodayCard>
      <DolulukCard doluluk={doluluk} toplamCocuk={toplamCocuk} navigate={navigate} />
    </div>
  );
}
