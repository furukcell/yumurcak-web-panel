import React, { useEffect, useState } from 'react';
import { Typography, List, Button, Drawer, Form, Input, Switch, Tag, message, Empty, Space, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { ref, onValue, push, set, update, remove, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { parseChildBirthDate, normalizeChildBirthDate, formatChildBirthDate } from '../utils/childDates';

const { Title, Text, Paragraph } = Typography;

// Mobildeki EventListScreen.js + EventFormScreen.js'in web karşılığı.
export default function EventsPage() {
  const { kullanici, kres } = useAuth();
  const kresId = kres?.id || kullanici?.kresId;

  const [etkinlikler, setEtkinlikler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [siniflar, setSiniflar] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [seciliSiniflar, setSeciliSiniflar] = useState([]);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!kresId) {
      setEtkinlikler([]);
      setLoading(false);
      return;
    }

    let etkinlikData = {};
    let sinifData = {};
    let etkinlikLoaded = false;
    let sinifLoaded = false;

    function build() {
      if (!etkinlikLoaded || !sinifLoaded) return;
      const liste = Object.entries(etkinlikData).map(([id, e]) => {
        const sinifAdlari = (e.sinifIds || []).map((sid) => sinifData[sid]?.ad).filter(Boolean);
        return { id, baslik: e.baslik || 'İsimsiz Etkinlik', tarih: e.tarih || null, saat: e.saat || null, aciklama: e.aciklama || null, aktif: e.aktif !== false, sinifIds: e.sinifIds || [], sinifAdlari };
      });
      liste.sort((a, b) => {
        if (!a.tarih) return 1;
        if (!b.tarih) return -1;
        return a.tarih.localeCompare(b.tarih);
      });
      setEtkinlikler(liste);
      setLoading(false);
    }

    const etkinlikUnsub = onValue(
      query(ref(database, 'etkinlikler'), orderByChild('kresId'), equalTo(kresId)),
      (snap) => { etkinlikData = snap.val() || {}; etkinlikLoaded = true; build(); },
      () => { etkinlikLoaded = true; build(); }
    );
    const sinifUnsub = onValue(
      query(ref(database, 'siniflar'), orderByChild('kresId'), equalTo(kresId)),
      (snap) => { sinifData = snap.val() || {}; sinifLoaded = true; build(); setSiniflar(Object.entries(sinifData).map(([id, s]) => ({ id, ad: s?.ad || 'İsimsiz Sınıf' }))); },
      () => { sinifLoaded = true; build(); }
    );

    return () => { etkinlikUnsub(); sinifUnsub(); };
  }, [kresId]);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ aktif: true });
    setSeciliSiniflar([]);
    setDrawerOpen(true);
  };

  const openEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({ baslik: record.baslik, tarih: record.tarih ? formatChildBirthDate(record.tarih) : '', saat: record.saat, aciklama: record.aciklama, aktif: record.aktif });
    setSeciliSiniflar(record.sinifIds || []);
    setDrawerOpen(true);
  };

  const toggleSinif = (sinifId) => {
    setSeciliSiniflar((prev) => (prev.includes(sinifId) ? prev.filter((id) => id !== sinifId) : [...prev, sinifId]));
  };

  const handleSave = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    if (!values.tarih || !parseChildBirthDate(values.tarih)) {
      message.error('Tarihi 25.06.2026 formatında gir.');
      return;
    }
    if (seciliSiniflar.length === 0) {
      message.error('Lütfen en az bir sınıf seç.');
      return;
    }

    setSaving(true);
    try {
      const veri = {
        kresId: kresId || '',
        baslik: values.baslik.trim(),
        tarih: normalizeChildBirthDate(values.tarih),
        saat: (values.saat || '').trim(),
        sinifIds: seciliSiniflar,
        aciklama: (values.aciklama || '').trim(),
        aktif: values.aktif !== false,
      };

      if (editingId) {
        await update(ref(database, `etkinlikler/${editingId}`), veri);
      } else {
        const yeniRef = push(ref(database, 'etkinlikler'));
        await set(yeniRef, { ...veri, createdAt: Date.now() });
      }

      message.success('Etkinlik kaydedildi');
      setDrawerOpen(false);
    } catch (error) {
      console.error(error);
      message.error(`Kaydedilirken bir sorun oluştu: ${error?.message || ''}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await remove(ref(database, `etkinlikler/${id}`));
      message.success('Etkinlik silindi');
      setDrawerOpen(false);
    } catch (error) {
      message.error('Silinirken bir sorun oluştu');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Etkinlikler</Title>
          <Text type="secondary">{etkinlikler.length} etkinlik</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Etkinlik Ekle</Button>
      </div>

      <List
        loading={loading}
        dataSource={etkinlikler}
        locale={{ emptyText: <Empty description="Henüz etkinlik eklenmemiş" /> }}
        renderItem={(item) => (
          <List.Item
            onClick={() => openEdit(item)}
            style={{ cursor: 'pointer', background: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, border: `1px solid ${THEME.border}` }}
          >
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text strong>{item.baslik}</Text>
                <Tag color={item.aktif ? 'green' : 'red'}>{item.aktif ? 'Aktif' : 'Pasif'}</Tag>
              </div>
              <Text type="secondary">📅 {item.tarih ?? '-'} {item.saat ? `· ${item.saat}` : ''}</Text>
              <br />
              <Text type="secondary">🏫 {item.sinifAdlari.length > 0 ? item.sinifAdlari.join(', ') : 'Sınıf seçilmemiş'}</Text>
              {item.aciklama && <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginTop: 6, marginBottom: 0 }}>{item.aciklama}</Paragraph>}
            </div>
          </List.Item>
        )}
      />

      <Drawer
        title={editingId ? 'Etkinliği Düzenle' : 'Yeni Etkinlik'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={440}
        extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? 'Güncelle' : 'Oluştur'}</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="baslik" label="Etkinlik Başlığı" rules={[{ required: true, message: 'Başlık zorunlu' }]}>
            <Input placeholder="Örn: Piknik Etkinliği" />
          </Form.Item>
          <Form.Item name="tarih" label="Tarih" rules={[{ required: true, message: 'Tarih zorunlu' }]} extra="Örn: 25.06.2026">
            <Input placeholder="25.06.2026" />
          </Form.Item>
          <Form.Item name="saat" label="Saat (opsiyonel)">
            <Input placeholder="10:00" />
          </Form.Item>
          <Form.Item name="aciklama" label="Açıklama (opsiyonel)">
            <Input.TextArea rows={4} placeholder="Etkinlik hakkında detay yaz..." />
          </Form.Item>

          <Form.Item label="Sınıflar (birden fazla seçilebilir)" required>
            <Space wrap>
              {siniflar.length === 0 ? (
                <Text type="secondary">Henüz sınıf eklenmemiş.</Text>
              ) : (
                siniflar.map((s) => (
                  <Tag.CheckableTag key={s.id} checked={seciliSiniflar.includes(s.id)} onChange={() => toggleSinif(s.id)}>
                    {seciliSiniflar.includes(s.id) ? '✓ ' : ''}{s.ad}
                  </Tag.CheckableTag>
                ))
              )}
            </Space>
          </Form.Item>

          <Form.Item name="aktif" label="Etkinlik Aktif" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>

        {editingId && (
          <Popconfirm title="Bu etkinliği silmek istediğine emin misin?" okText="Sil" cancelText="Vazgeç" okButtonProps={{ danger: true }} onConfirm={() => handleDelete(editingId)}>
            <Button danger icon={<DeleteOutlined />} block>Etkinliği Sil</Button>
          </Popconfirm>
        )}
      </Drawer>
    </div>
  );
}
