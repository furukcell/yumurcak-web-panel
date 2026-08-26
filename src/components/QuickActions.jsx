import React, { useEffect, useState } from 'react';
import { Badge } from 'antd';
import { MessageOutlined, ScheduleOutlined, NotificationOutlined, BellOutlined, PictureOutlined } from '@ant-design/icons';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { THEME } from '../theme';

// "kurumZili" (bkz. BellPage.jsx) altındaki tamamlanmamış kayıtları canlı
// sayar — dashboard'daki Kurum Zili rozetinde kaç veli beklediğini gösterir.
function useKurumZiliPendingCount(kresId) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!kresId) { setCount(0); return undefined; }
    const q = query(ref(database, 'kurumZili'), orderByChild('kresId'), equalTo(kresId));
    const unsub = onValue(
      q,
      (snap) => {
        const data = snap.val() || {};
        const aktif = Object.values(data).filter((i) => !(i.tamamlandi || i.tamamlandı)).length;
        setCount(aktif);
      },
      () => setCount(0)
    );
    return unsub;
  }, [kresId]);
  return count;
}

// Dashboard'ın en üstündeki (üst bar ile "Hoş Geldiniz" kartı arasındaki)
// hızlı erişim şeridi. Sık kullanılan 4 sayfaya tek tıkla gidiş + canlı
// rozet sayaçları (okunmamış mesaj / bekleyen kurum zili).
export default function QuickActions({ navigate, kresId, unreadMessages }) {
  const pendingBell = useKurumZiliPendingCount(kresId);

  const items = [
    { key: '/mesajlar', label: 'Mesajlar', icon: <MessageOutlined />, color: THEME.blue, count: unreadMessages },
    { key: '/ayarlar/kurum-zili', label: 'Kurum Zili', icon: <BellOutlined />, color: THEME.red, count: pendingBell },
    { key: '/galeri', label: 'Galeri', icon: <PictureOutlined />, color: THEME.orange, count: 0 },
    { key: '/duyurular', label: 'Duyurular', icon: <NotificationOutlined />, color: THEME.purple, count: 0 },
    { key: '/ders-programi', label: 'Ders Programı', icon: <ScheduleOutlined />, color: THEME.teal, count: 0 },
  ];

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
      {items.map((item) => (
        <div
          key={item.key}
          onClick={() => navigate(item.key)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 14px',
            borderRadius: 999,
            background: `${item.color}14`,
            border: `1px solid ${item.color}33`,
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: 13,
            color: item.color,
            transition: 'transform 0.12s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <span style={{ fontSize: 15, display: 'flex' }}>{item.icon}</span>
          {item.label}
          {item.count > 0 && <Badge count={item.count} size="small" style={{ marginLeft: 2 }} />}
        </div>
      ))}
    </div>
  );
}
