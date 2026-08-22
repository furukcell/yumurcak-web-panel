import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Card, Button, Tag, Row, Col, Empty, message, Spin } from 'antd';
import { ref, onValue, update } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';

const { Title, Text } = Typography;

function safeObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function toList(data) { return Object.entries(safeObject(data)).map(([id, item]) => ({ id, ...safeObject(item) })); }
function normalizeText(v) { return String(v || '').toLowerCase().trim(); }
function formatTime(value) {
  if (!value) return 'Saat yok';
  let date = null;
  if (typeof value === 'number') date = new Date(value);
  if (typeof value === 'string') { const n = Number(value); date = Number.isFinite(n) && value.length >= 10 ? new Date(n) : new Date(value); }
  if (!date || Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function teslimLabel(value) {
  const v = normalizeText(value);
  if (v === 'birakacagim' || v === 'birakacağım' || v === 'birakma') return '🏫 Bırakacağım';
  if (v === 'alacagim' || v === 'alacağım' || v === 'alma') return '👋 Alacağım';
  return value || 'Teslim bilgisi yok';
}
function durumLabel(value) {
  const v = normalizeText(value);
  if (v === 'kapidayim' || v === 'kapıdayım') return '📍 Kapıdayım';
  if (v === 'geliyorum') return '🚗 Geliyorum';
  if (v === 'tamamlandi' || v === 'tamamlandı') return '✅ Tamamlandı';
  return value || 'Bildirim';
}
function getAccent(item) {
  const durum = normalizeText(item?.durum || item?.status);
  if (item?.tamamlandi || item?.tamamlandı) return THEME.green;
  if (durum === 'kapidayim' || durum === 'kapıdayım') return THEME.red;
  if (durum === 'geliyorum') return THEME.orange;
  return THEME.blue;
}

// Mobildeki AdminBellScreen.js'in web karşılığı.
export default function BellPage() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId || kullanici?.kurumId || null;

  const [bildirimler, setBildirimler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsub = onValue(
      ref(database, 'kurumZili'),
      (snap) => {
        const liste = toList(snap.val())
          .filter((item) => !kresId || !item.kresId || item.kresId === kresId || item.kurumId === kresId)
          .sort((a, b) => Number(b.createdAt || b.updatedAt || 0) - Number(a.createdAt || a.updatedAt || 0));
        setBildirimler(liste);
        setLoading(false);
      },
      () => { setBildirimler([]); setLoading(false); }
    );
    return () => unsub();
  }, [kresId]);

  const stats = useMemo(() => {
    const aktif = bildirimler.filter((i) => !(i.tamamlandi || i.tamamlandı)).length;
    const okunmamis = bildirimler.filter((i) => !(i.okundu || i.read) && !(i.tamamlandi || i.tamamlandı)).length;
    const tamamlanan = bildirimler.filter((i) => i.tamamlandi || i.tamamlandı).length;
    return { aktif, okunmamis, tamamlanan };
  }, [bildirimler]);

  async function markOkundu(item) {
    setBusyId(item.id);
    try {
      await update(ref(database, `kurumZili/${item.id}`), { okundu: true, read: true, okunduAt: Date.now(), updatedAt: Date.now() });
    } catch {
      message.error('Bildirim okundu yapılamadı.');
    } finally {
      setBusyId(null);
    }
  }

  async function markTamamlandi(item) {
    setBusyId(item.id);
    try {
      await update(ref(database, `kurumZili/${item.id}`), { okundu: true, read: true, tamamlandi: true, tamamlandiAt: Date.now(), updatedAt: Date.now() });
    } catch {
      message.error('Bildirim tamamlandı yapılamadı.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>Kurum Zili</Title>
      <Text type="secondary">Veliler "Geliyorum" veya "Kapıdayım" dediğinde burada görünür</Text>

      <Row gutter={[12, 12]} style={{ margin: '16px 0' }}>
        <Col span={8}><Card size="small" style={{ textAlign: 'center', borderColor: THEME.border }}><Text strong style={{ fontSize: 22, color: THEME.orange }}>{stats.aktif}</Text><br /><Text type="secondary">Aktif</Text></Card></Col>
        <Col span={8}><Card size="small" style={{ textAlign: 'center', borderColor: THEME.border }}><Text strong style={{ fontSize: 22, color: THEME.red }}>{stats.okunmamis}</Text><br /><Text type="secondary">Okunmamış</Text></Card></Col>
        <Col span={8}><Card size="small" style={{ textAlign: 'center', borderColor: THEME.border }}><Text strong style={{ fontSize: 22, color: THEME.green }}>{stats.tamamlanan}</Text><br /><Text type="secondary">Tamamlanan</Text></Card></Col>
      </Row>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : bildirimler.length === 0 ? (
        <Empty description="Henüz kurum zili bildirimi yok" />
      ) : (
        bildirimler.map((item) => {
          const tamamlandi = !!(item.tamamlandi || item.tamamlandı);
          const okundu = !!(item.okundu || item.read);
          const busy = busyId === item.id;
          const accent = getAccent(item);
          const durum = item.durum || item.status;

          return (
            <Card key={item.id} style={{ marginBottom: 12, borderColor: !okundu && !tamamlandi ? '#FFD1DA' : THEME.border, background: !okundu && !tamamlandi ? '#FFF8FA' : '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <Text strong>{item.cocukAdi || item.cocukAd || item.childName || item.cocukId || 'Çocuk'}</Text>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>{item.veliAdi || item.veliAd || item.parentName || item.veliId || 'Veli'}</Text></div>
                </div>
                <Tag color={accent}>{tamamlandi ? '✅ Tamamlandı' : durumLabel(durum)}</Tag>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${THEME.border}` }}>
                <Text type="secondary">Teslim</Text><Text strong>{teslimLabel(item.teslimTuru || item.teslimTipi || item.type)}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${THEME.border}` }}>
                <Text type="secondary">Saat</Text><Text strong>{formatTime(item.createdAt || item.tarih || item.time)}</Text>
              </div>
              {(item.not || item.note) && <div style={{ background: '#F6F3FF', borderRadius: 12, padding: 10, marginTop: 8 }}><Text>{item.not || item.note}</Text></div>}

              {!tamamlandi && (
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  {!okundu && <Button style={{ flex: 1 }} loading={busy} onClick={() => markOkundu(item)}>👀 Okundu</Button>}
                  <Button type="primary" style={{ flex: 1, background: THEME.green, borderColor: THEME.green }} loading={busy} onClick={() => markTamamlandi(item)}>✅ Tamamlandı</Button>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
