import { useEffect, useRef } from 'react';
import { notification } from 'antd';
import { listenNotifications, readNotification } from '../utils/notificationCenter';

// Mobildeki push-benzeri davranışın web karşılığı: yeni bir kayıt
// "bildirimler/{kresId}" altına düşünce ekranın neresinde olursak olalım
// sağ altta bir toast çıkar (antd'nin varsayılan placement'ı — sol alt
// istenirse aşağıdaki notification.config placement'ı 'bottomLeft' yapmak
// yeterli).
notification.config({ placement: 'bottomRight', duration: 6 });

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
        notification.open({
          key: n.id,
          message: n.baslik,
          description: n.mesaj,
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
