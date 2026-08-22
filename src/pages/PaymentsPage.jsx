import React, { useEffect, useMemo, useState } from 'react';
import { Typography, List, Button, Drawer, Form, Input, Select, Tag, message, Empty, Space, Row, Col, Card } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ref, onValue, set, push, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { asArray } from '../utils/crudHelpers';
import { createUserNotification } from '../utils/notificationCenter';

const { Title, Text } = Typography;

const AY_ADLARI = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DURUM_META = {
  tum: { label: 'Tümü', color: THEME.primary },
  odendi: { label: '✅ Ödendi', color: THEME.green },
  bekliyor: { label: '⏳ Bekliyor', color: THEME.orange },
  gecikti: { label: '❗ Gecikti', color: THEME.red },
};

function safeObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function toList(data) { return Object.entries(safeObject(data)).map(([id, item]) => ({ id, ...safeObject(item) })); }
function pad2(v) { return String(v).padStart(2, '0'); }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function currentMonthKey() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function clampMonth(v) { const n = Number(v); return Number.isFinite(n) ? Math.min(12, Math.max(1, n)) : new Date().getMonth() + 1; }
function normalizeDurum(item = {}) {
  const v = String(item.durum || item.status || '').toLowerCase().trim();
  if (['odendi', 'ödendi', 'paid', 'tamamlandi', 'tamamlandı'].includes(v)) return 'odendi';
  if (['gecikti', 'geçti', 'late', 'overdue'].includes(v)) return 'gecikti';
  const due = item.sonOdemeTarihi || item.dueDate;
  if (due && Date.parse(due) < Date.now()) return 'gecikti';
  return 'bekliyor';
}
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
function getChildName(cocuk = {}, odeme = {}) {
  return `${cocuk.ad || ''} ${cocuk.soyad || ''}`.trim() || cocuk.adSoyad || cocuk.isim || odeme.cocukAd || odeme.cocukAdi || odeme.childName || odeme.cocukId || 'Çocuk';
}
function getDonem(o = {}) {
  if (o.donem) return o.donem;
  if (o.tarih && String(o.tarih).length >= 7) { const [y, m] = String(o.tarih).split('-'); return `${AY_ADLARI[Number(m)] || m} ${y}`; }
  return `${AY_ADLARI[Number(o.ay)] || o.ay || ''} ${o.yil || ''}`.trim() || 'Dönem yok';
}
function getMonthKey(o = {}) {
  if (o.tarih && String(o.tarih).length >= 7) return String(o.tarih).slice(0, 7);
  const yil = Number(o.yil || o.year);
  const ay = Number(o.ay || o.month);
  if (yil && ay) return `${yil}-${pad2(ay)}`;
  return '';
}
function monthLabel(ay, yil) { return `${AY_ADLARI[Number(ay)] || ay} ${yil || ''}`.trim(); }
function dueDateForMonth(yil, ay) { return `${Number(yil) || new Date().getFullYear()}-${pad2(clampMonth(ay))}-10`; }

// Mobildeki PaymentListScreen.js + PaymentFormScreen.js'in web karşılığı.
export default function PaymentsPage() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId || kullanici?.kurumId || null;

  const [odemeler, setOdemeler] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('tum');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDurum, setSelectedDurum] = useState('bekliyor');
  const [createdAt, setCreatedAt] = useState(Date.now());
  const [form] = Form.useForm();

  useEffect(() => {
    let odemelerData = {}, childrenData = {}, odemelerLoaded = false, childrenLoaded = false;
    function build() {
      if (!odemelerLoaded || !childrenLoaded) return;
      const liste = toList(odemelerData)
        .filter((o) => !kresId || !o.kresId || o.kresId === kresId || o.kurumId === kresId)
        .map((o) => {
          const cocuk = safeObject(childrenData[o.cocukId] || childrenData[o.childId]);
          return { ...o, durum: normalizeDurum(o), cocukId: o.cocukId || o.childId || '', cocukAd: getChildName(cocuk, o), donem: getDonem(o), monthKey: getMonthKey(o), tutarNumber: toNumber(o.tutar || o.amount) };
        })
        .sort((a, b) => {
          const dateA = Date.parse(`${a.monthKey || '1970-01'}-01`) || Number(a.createdAt || 0);
          const dateB = Date.parse(`${b.monthKey || '1970-01'}-01`) || Number(b.createdAt || 0);
          return dateB - dateA;
        });
      setOdemeler(liste);
      setLoading(false);
    }

    const odemelerUnsub = onValue(ref(database, 'odemeler'), (snap) => { odemelerData = safeObject(snap.val()); odemelerLoaded = true; build(); }, () => { odemelerLoaded = true; build(); });
    const childrenTarget = kresId ? query(ref(database, 'cocuklar'), orderByChild('kresId'), equalTo(kresId)) : ref(database, 'cocuklar');
    const childrenUnsub = onValue(childrenTarget, (snap) => {
      childrenData = safeObject(snap.val());
      const liste = toList(childrenData).map((c) => ({ ...c, adSoyad: getChildName(c) })).sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'));
      setChildren(liste);
      childrenLoaded = true;
      build();
    }, () => { childrenLoaded = true; build(); });

    return () => { odemelerUnsub(); childrenUnsub(); };
  }, [kresId]);

  const stats = useMemo(() => {
    const buAy = currentMonthKey();
    const bekleyenler = odemeler.filter((o) => o.durum !== 'odendi');
    return {
      odendi: odemeler.filter((o) => o.durum === 'odendi').length,
      gecikti: odemeler.filter((o) => o.durum === 'gecikti').length,
      acikTutar: bekleyenler.reduce((sum, o) => sum + o.tutarNumber, 0),
      buAyTutar: odemeler.filter((o) => o.monthKey === buAy).reduce((sum, o) => sum + o.tutarNumber, 0),
    };
  }, [odemeler]);

  const filtered = useMemo(() => (filter === 'tum' ? odemeler : odemeler.filter((o) => o.durum === filter)), [filter, odemeler]);

  async function odendiYap(item) {
    try {
      await set(ref(database, `odemeler/${item.id}`), { ...item, durum: 'odendi', status: 'odendi', odemeTarihi: item.odemeTarihi || todayKey(), updatedAt: Date.now() });
      message.success('Ödeme durumu güncellendi');
    } catch {
      message.error('Ödeme durumu güncellenemedi.');
    }
  }

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setSelectedChildId(children[0]?.id || '');
    setSelectedMonth(new Date().getMonth() + 1);
    setSelectedYear(new Date().getFullYear());
    setSelectedDurum('bekliyor');
    setCreatedAt(Date.now());
    form.setFieldsValue({ baslik: 'Aylık Kreş Ücreti', sonOdemeTarihi: dueDateForMonth(new Date().getFullYear(), new Date().getMonth() + 1) });
    setDrawerOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setSelectedChildId(item.cocukId);
    setSelectedMonth(clampMonth(item.ay || String(item.tarih || '').split('-')[1]));
    setSelectedYear(Number(item.yil || String(item.tarih || '').split('-')[0]) || new Date().getFullYear());
    setSelectedDurum(item.durum);
    setCreatedAt(item.createdAt || Date.now());
    form.setFieldsValue({ baslik: item.baslik || item.title || 'Aylık Kreş Ücreti', tutar: String(item.tutar || item.amount || ''), sonOdemeTarihi: item.sonOdemeTarihi || item.dueDate || '', odemeTarihi: item.odemeTarihi || item.paymentDate || '', aciklama: item.aciklama || item.description || '' });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    let values;
    try { values = await form.validateFields(); } catch { return; }
    if (!selectedChildId) { message.error('Çocuk seçmelisin.'); return; }
    const finalTutar = toNumber(values.tutar);
    if (!finalTutar) { message.error('Geçerli bir tutar gir.'); return; }

    setSaving(true);
    try {
      const cocuk = children.find((c) => c.id === selectedChildId) || {};
      const veliIds = asArray(cocuk.veliIds || cocuk.parentIds || cocuk.veliler).filter(Boolean);
      const finalVeliIds = veliIds.length ? veliIds : (cocuk.veliId || cocuk.parentId ? [cocuk.veliId || cocuk.parentId] : []);
      const finalOdemeTarihi = selectedDurum === 'odendi' ? (values.odemeTarihi || todayKey()) : (values.odemeTarihi || null);

      const veri = {
        kresId, cocukId: selectedChildId, childId: selectedChildId,
        veliId: finalVeliIds[0] || null, parentId: finalVeliIds[0] || null, veliIds: finalVeliIds, parentIds: finalVeliIds,
        baslik: values.baslik.trim() || 'Aylık Kreş Ücreti', title: values.baslik.trim() || 'Aylık Kreş Ücreti',
        aciklama: (values.aciklama || '').trim() || values.baslik.trim(),
        ay: selectedMonth, yil: selectedYear, donem: monthLabel(selectedMonth, selectedYear), tarih: `${selectedYear}-${pad2(selectedMonth)}`,
        tutar: finalTutar, amount: finalTutar, durum: selectedDurum, status: selectedDurum,
        sonOdemeTarihi: values.sonOdemeTarihi || null, odemeTarihi: finalOdemeTarihi,
        createdAt, updatedAt: Date.now(),
      };

      if (editingId) {
        await set(ref(database, `odemeler/${editingId}`), veri);
      } else {
        await push(ref(database, 'odemeler'), veri);
        if (finalVeliIds.length > 0) {
          await createUserNotification({ kresId, userIds: finalVeliIds, baslik: '💳 Yeni ödeme kaydı', mesaj: `${getChildName(cocuk)} için ${monthLabel(selectedMonth, selectedYear)} dönemine ait ${formatMoney(finalTutar)} ödeme kaydı oluşturuldu.`, tip: 'odeme', routeName: 'ParentPayments', createdBy: kullanici?.uid || kullanici?.id || '' });
        }
      }
      message.success(editingId ? 'Ödeme güncellendi' : 'Ödeme kaydı oluşturuldu');
      setDrawerOpen(false);
    } catch (error) {
      message.error('Kayıt sırasında bir sorun oluştu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Ödemeler</Title>
          <Text type="secondary">Aidat ve ücret kayıtlarını buradan takip et</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Kayıt</Button>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small" style={{ borderColor: THEME.border }}><Text type="secondary" style={{ fontSize: 12 }}>Açık Tutar</Text><div><Text strong style={{ color: THEME.red, fontSize: 18 }}>{formatMoney(stats.acikTutar)}</Text></div></Card></Col>
        <Col xs={12} md={6}><Card size="small" style={{ borderColor: THEME.border }}><Text type="secondary" style={{ fontSize: 12 }}>Bu Ay</Text><div><Text strong style={{ color: THEME.primary, fontSize: 18 }}>{formatMoney(stats.buAyTutar)}</Text></div></Card></Col>
        <Col xs={12} md={6}><Card size="small" style={{ borderColor: THEME.border }}><Text type="secondary" style={{ fontSize: 12 }}>Ödendi</Text><div><Text strong style={{ color: THEME.green, fontSize: 18 }}>{stats.odendi}</Text></div></Card></Col>
        <Col xs={12} md={6}><Card size="small" style={{ borderColor: THEME.border }}><Text type="secondary" style={{ fontSize: 12 }}>Geciken</Text><div><Text strong style={{ color: THEME.red, fontSize: 18 }}>{stats.gecikti}</Text></div></Card></Col>
      </Row>

      <Space wrap style={{ marginBottom: 14 }}>
        {['tum', 'bekliyor', 'gecikti', 'odendi'].map((key) => (
          <Tag.CheckableTag key={key} checked={filter === key} onChange={() => setFilter(key)}>{DURUM_META[key].label}</Tag.CheckableTag>
        ))}
      </Space>

      <List
        loading={loading}
        dataSource={filtered}
        locale={{ emptyText: <Empty description="Ödeme kaydı yok" /> }}
        renderItem={(item) => {
          const meta = DURUM_META[item.durum];
          return (
            <List.Item style={{ background: '#fff', border: `1px solid ${THEME.border}`, borderRadius: 16, padding: 16, marginBottom: 10 }}>
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div onClick={() => openEdit(item)} style={{ cursor: 'pointer', flex: 1 }}>
                    <Text strong style={{ fontSize: 15 }}>{item.cocukAd}</Text>
                    <div><Text style={{ color: THEME.primary, fontSize: 13, fontWeight: 700 }}>{item.baslik || item.aciklama || 'Aylık ücret'}</Text></div>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>{item.donem}</Text></div>
                  </div>
                  <Tag color={meta.color}>{meta.label}</Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${THEME.border}` }}>
                  <div><Text type="secondary" style={{ fontSize: 11 }}>Tutar</Text><div><Text strong style={{ fontSize: 18 }}>{formatMoney(item.tutar || item.amount)}</Text></div></div>
                  <div style={{ textAlign: 'right' }}><Text type="secondary" style={{ fontSize: 11 }}>{item.odemeTarihi ? 'Ödeme tarihi' : 'Son ödeme'}</Text><div><Text strong style={{ fontSize: 13 }}>{item.odemeTarihi || item.sonOdemeTarihi || '-'}</Text></div></div>
                </div>
                <Space style={{ marginTop: 12, width: '100%' }}>
                  <Button size="small" onClick={() => openEdit(item)}>Düzenle</Button>
                  {item.durum !== 'odendi' && <Button size="small" type="primary" style={{ background: THEME.green, borderColor: THEME.green }} onClick={() => odendiYap(item)}>Ödendi Yap</Button>}
                </Space>
              </div>
            </List.Item>
          );
        }}
      />

      <Drawer title={editingId ? 'Ödeme Kaydını Düzenle' : 'Yeni Ödeme Kaydı'} open={drawerOpen} onClose={() => setDrawerOpen(false)} width={460} extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? 'Güncelle' : 'Oluştur'}</Button>}>
        <Text strong>Çocuk Seçimi</Text>
        <Select style={{ width: '100%', marginTop: 6, marginBottom: 16 }} value={selectedChildId || undefined} onChange={setSelectedChildId} placeholder={children.length === 0 ? 'Bu kuruma bağlı çocuk yok' : 'Çocuk seçin'} disabled={children.length === 0} options={children.map((c) => ({ value: c.id, label: c.adSoyad }))} />

        <Space style={{ marginBottom: 12 }}>
          <Button size="small" onClick={() => { const d = new Date(); setSelectedMonth(d.getMonth() + 1); setSelectedYear(d.getFullYear()); form.setFieldsValue({ sonOdemeTarihi: dueDateForMonth(d.getFullYear(), d.getMonth() + 1) }); }}>Bu Ay</Button>
          <Button size="small" onClick={() => { const d = new Date(); d.setMonth(d.getMonth() + 1); setSelectedMonth(d.getMonth() + 1); setSelectedYear(d.getFullYear()); form.setFieldsValue({ sonOdemeTarihi: dueDateForMonth(d.getFullYear(), d.getMonth() + 1) }); }}>Gelecek Ay</Button>
        </Space>

        <Form form={form} layout="vertical">
          <Form.Item name="baslik" label="Başlık" rules={[{ required: true, message: 'Zorunlu' }]}>
            <Input placeholder="Aylık Kreş Ücreti" />
          </Form.Item>

          <Text strong>Ay</Text>
          <Space wrap style={{ marginTop: 6, marginBottom: 16 }}>
            {AY_ADLARI.slice(1).map((ad, i) => (
              <Tag.CheckableTag key={ad} checked={selectedMonth === i + 1} onChange={() => setSelectedMonth(i + 1)}>{ad.slice(0, 3)}</Tag.CheckableTag>
            ))}
          </Space>

          <Form.Item label="Yıl">
            <Input value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value) || new Date().getFullYear())} placeholder="2026" maxLength={4} />
          </Form.Item>

          <Form.Item name="tutar" label="Tutar (₺)" rules={[{ required: true, message: 'Zorunlu' }]}>
            <Input placeholder="7500" />
          </Form.Item>

          <Text strong>Durum</Text>
          <Space wrap style={{ marginTop: 6, marginBottom: 16 }}>
            {['bekliyor', 'odendi', 'gecikti'].map((d) => (
              <Tag.CheckableTag key={d} checked={selectedDurum === d} onChange={() => setSelectedDurum(d)}>{DURUM_META[d].label}</Tag.CheckableTag>
            ))}
          </Space>

          <Form.Item name="sonOdemeTarihi" label="Son Ödeme Tarihi" extra={`Örnek: ${dueDateForMonth(selectedYear, selectedMonth)}`}>
            <Input placeholder="YYYY-AA-GG" maxLength={10} />
          </Form.Item>
          <Form.Item name="odemeTarihi" label="Ödeme Tarihi">
            <Input placeholder="YYYY-AA-GG" maxLength={10} />
          </Form.Item>
          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={3} placeholder="Örn: Haziran aidatı" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
