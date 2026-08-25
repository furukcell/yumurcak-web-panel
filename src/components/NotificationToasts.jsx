import { useEffect, useRef } from 'react';
import { notification } from 'antd';
import {
  MessageOutlined, NotificationOutlined, CalendarOutlined,
  WalletOutlined, BellOutlined, GiftOutlined,
} from '@ant-design/icons';
import { listenNotifications, readNotification } from '../utils/notificationCenter';
import { THEME } from '../theme';

// Mobildeki push-benzeri davranışın web karşılığı: yeni bir kayıt
// "bildirimler/{kresId}" altına düşünce ekranın neresinde olursak olalım
// sağ altta bir toast çıkar (sol alt istenirse placement'ı 'bottomLeft'
// yapmak yeterli).
notification.config({ placement: 'bottomRight', duration: 6 });

// Bildirim tipine göre renk + ikon — dashboard'daki QuickActions/özet
// kartlarındaki renkli-daire mantığının toast karşılığı.
const TIP_STYLES = {
  mesaj: { color: THEME.blue, icon: <MessageOutlined /> },
  duyuru: { color: THEME.red, icon: <NotificationOutlined /> },
  etkinlik: { color: THEME.teal, icon: <CalendarOutlined /> },
  odeme: { color: THEME.orange, icon: <WalletOutlined /> },
  zil: { color: THEME.red, icon: <BellOutlined /> },
  kurumzili: { color: THEME.red, icon: <BellOutlined /> },
  dogumgunu: { color: THEME.gold, icon: <GiftOutlined /> },
  genel: { color: THEME.purple, icon: <BellOutlined /> },
};

function getTipStyle(tip) {
  const key = String(tip || 'genel').toLowerCase().replace(/[^a-z]/g, '');
  return TIP_STYLES[key] || TIP_STYLES.genel;
}

export default function NotificationToasts({ kullanici }) {
  // null: ilk snapshot henüz gelmedi. İlk snapshot geldiğinde o anda
  // mevcut olan tüm bildirimler "zaten görülmüş" sayılır — sayfa
  // açılışında geçmiş bildirimler için toast yağmasın diye.
  const seenIds = useRef(null);
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    seenIds.current = null;
    mountedAt.current = Date.now();
    if (!kullanici?.kresId) return undefined;

    const unsub = listenNotifications(kullanici, (list) => {
      if (seenIds.current === null) {
        seenIds.current = new Set(list.map((n) => n.id));
        return;
      }

      const yeniler = list.filter((n) => !seenIds.current.has(n.id) && n.createdAt >= mountedAt.current);
      yeniler.forEach((n) => {
        const { color, icon } = getTipStyle(n.tip);
        notification.open({
          key: n.id,
          duration: 6,
          icon: (
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: `${color}1F`,
                color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              {icon}
            </span>
          ),
          message: <span style={{ fontWeight: 800, fontSize: 14, color: THEME.text }}>{n.baslik}</span>,
          description: <span style={{ fontSize: 13, color: THEME.muted }}>{n.mesaj}</span>,
          style: {
            borderRadius: 20,
            border: `1px solid ${color}33`,
            boxShadow: `0 14px 32px ${color}26, 0 2px 8px rgba(25,26,35,0.06)`,
            background: `linear-gradient(135deg, ${color}14 0%, #FFFFFF 60%)`,
          },
          onClick: () => {
            readNotification(n.id, kullanici);
            notification.destroy(n.id);
          },
        });
      });
      list.forEach((n) => seenIds.current.add(n.id));
    });

    return unsub;
  }, [kullanici?.kresId, kullanici?.uid, kullanici?.id]);

  return null;
}
