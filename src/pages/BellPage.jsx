import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Card, Button, Tag, Row, Col, Empty, message, Spin } from 'antd';
import { ref, onValue, update, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME, cardStyle } from '../theme';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

function safeObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function toList(data) { return Object.entries(safeObject(data)).map(([id, item]) => ({ id, ...safeObject(item) })); }
function normalizeText(v) { return String(v || '').toLowerCase().trim(); }
function formatTime(value, t) {
  if (!value) return t('bell.noTime');
  let date = null;
  if (typeof value === 'number') date = new Date(value);
  if (typeof value === 'string') { const n = Number(value); date = Number.isFinite(n) && value.length >= 10 ? new Date(n) : new Date(value); }
  if (!date || Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function teslimLabel(value, t) {
  const v = normalizeText(value);
  if (v === 'birakacagim' || v === 'birakacağım' || v === 'birakma') return t('bell.leaving');
  if (v === 'alacagim' || v === 'alacağım' || v === 'alma') return t('bell.pickingUp');
  return value || t('bell.noDelivery');
}
function durumLabel(value, t) {
  const v = normalizeText(value);
  if (v === 'kapidayim' || v === 'kapıdayım') return t('bell.atDoor');
  if (v === 'geliyorum') return t('bell.coming');
  if (v === 'tamamlandi' || v === 'tamamlandı') return `✅ ${t('bell.complete')}`;
  return value || t('bell.notification');
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
  const { t } = useTranslation();
  const kresId = kullanici?.kresId || kullanici?.kurumId || null;

  const [bildirimler, setBildirimler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    setLoading(true);
    const bellTarget = kresId ? query(ref(database, 'kurumZili'), orderByChild('kresId'), equalTo(kresId)) : ref(database, 'kurumZili');
    const unsub = onValue(
      bellTarget,
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
      message.error(t('bell.readError'));
    } finally {
      setBusyId(null);
    }
  }

  async function markTamamlandi(item) {
    setBusyId(item.id);
    try {
      await update(ref(database, `kurumZili/${item.id}`), { okundu: true, read: true, tamamlandi: true, tamamlandiAt: Date.now(), updatedAt: Date.now() });
    } catch {
      message.error(t('bell.completeError'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>{t('bell.title')}</Title>
      <Text type="secondary">{t('bell.subtitle')}</Text>

      <Row gutter={[12, 12]} style={{ margin: '16px 0' }}>
        <Col span={8}><Card size="small" style={{ ...cardStyle(THEME.orange), textAlign: 'center' }}><Text strong style={{ fontSize: 22, color: THEME.orange }}>{stats.aktif}</Text><br /><Text type="secondary">{t('bell.active')}</Text></Card></Col>
        <Col span={8}><Card size="small" style={{ ...cardStyle(THEME.red), textAlign: 'center' }}><Text strong style={{ fontSize: 22, color: THEME.red }}>{stats.okunmamis}</Text><br /><Text type="secondary">{t('bell.unread')}</Text></Card></Col>
        <Col span={8}><Card size="small" style={{ ...cardStyle(THEME.green), textAlign: 'center' }}><Text strong style={{ fontSize: 22, color: THEME.green }}>{stats.tamamlanan}</Text><br /><Text type="secondary">{t('bell.completed')}</Text></Card></Col>
      </Row>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : bildirimler.length === 0 ? (
        <Empty description={t('bell.empty')} />
      ) : (
        bildirimler.map((item) => {
          const tamamlandi = !!(item.tamamlandi || item.tamamlandı);
          const okundu = !!(item.okundu || item.read);
          const busy = busyId === item.id;
          const accent = getAccent(item);
          const durum = item.durum || item.status;

          return (
            <Card key={item.id} style={{ ...cardStyle(tamamlandi ? THEME.green : !okundu ? THEME.red : THEME.orange), marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <Text strong>{item.cocukAdi || item.cocukAd || item.childName || item.cocukId || t('bell.child')}</Text>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>{item.veliAdi || item.veliAd || item.parentName || item.veliId || t('bell.parent')}</Text></div>
                </div>
                <Tag color={accent}>{tamamlandi ? `✅ ${t('bell.complete')}` : durumLabel(durum, t)}</Tag>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${THEME.border}` }}>
                <Text type="secondary">{t('bell.delivery')}</Text><Text strong>{teslimLabel(item.teslimTuru || item.teslimTipi || item.type, t)}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${THEME.border}` }}>
                <Text type="secondary">{t('bell.time')}</Text><Text strong>{formatTime(item.createdAt || item.tarih || item.time, t)}</Text>
              </div>
              {(item.not || item.note) && <div style={{ background: '#F6F3FF', borderRadius: 12, padding: 10, marginTop: 8 }}><Text>{item.not || item.note}</Text></div>}

              {!tamamlandi && (
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  {!okundu && <Button style={{ flex: 1 }} loading={busy} onClick={() => markOkundu(item)}>{`👀 ${t('bell.read')}`}</Button>}
                  <Button type="primary" style={{ flex: 1, background: THEME.green, borderColor: THEME.green }} loading={busy} onClick={() => markTamamlandi(item)}>{`✅ ${t('bell.complete')}`}</Button>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
