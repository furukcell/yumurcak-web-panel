import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      message.error(t('events.dateError'));
      return;
    }
    if (seciliSiniflar.length === 0) {
      message.error(t('events.classRequired'));
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

      message.success(t('events.saved'));
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
      message.success(t('events.deleted'));
      setDrawerOpen(false);
    } catch (error) {
      message.error(t('events.deleteError'));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>{t('events.title')}</Title>
          <Text type="secondary">{t('events.count',{count:etkinlikler.length})}</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('events.add')}</Button>
      </div>

      <List
        loading={loading}
        dataSource={etkinlikler}
        locale={{ emptyText: <Empty description={t('events.empty')} /> }}
        renderItem={(item) => (
          <List.Item
            onClick={() => openEdit(item)}
            style={{ cursor: 'pointer', background: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, border: `1px solid ${THEME.border}` }}
          >
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text strong>{item.baslik}</Text>
                <Tag color={item.aktif ? 'green' : 'red'}>{item.aktif ? t('events.active') : t('events.inactive')}</Tag>
              </div>
              <Text type="secondary">📅 {item.tarih ?? '-'} {item.saat ? `· ${item.saat}` : ''}</Text>
              <br />
              <Text type="secondary">🏫 {item.sinifAdlari.length > 0 ? item.sinifAdlari.join(', ') : '{t('events.noSelectedClass')}'}</Text>
              {item.aciklama && <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginTop: 6, marginBottom: 0 }}>{item.aciklama}</Paragraph>}
            </div>
          </List.Item>
        )}
      />

      <Drawer
        title={editingId ? t('events.edit') : t('events.new')}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={440}
        extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? t('events.update') : t('events.create')}</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="baslik" label={t('events.heading')} rules={[{ required: true, message: t('events.headingRequired') }]}>
            <Input placeholder={t('events.headingPlaceholder')} />
          </Form.Item>
          <Form.Item name="tarih" label={t('events.date')} rules={[{ required: true, message: t('events.dateRequired') }]} extra={t('events.dateExtra')}>
            <Input placeholder="25.06.2026" />
          </Form.Item>
          <Form.Item name="saat" label={t('events.time')}>
            <Input placeholder="10:00" />
          </Form.Item>
          <Form.Item name="aciklama" label={t('events.description')}>
            <Input.TextArea rows={4} placeholder={t('events.descriptionPlaceholder')} />
          </Form.Item>

          <Form.Item label={t('events.classes')} required>
            <Space wrap>
              {siniflar.length === 0 ? (
                <Text type="secondary">{t('events.noClass')}</Text>
              ) : (
                siniflar.map((s) => (
                  <Tag.CheckableTag key={s.id} checked={seciliSiniflar.includes(s.id)} onChange={() => toggleSinif(s.id)}>
                    {seciliSiniflar.includes(s.id) ? '✓ ' : ''}{s.ad}
                  </Tag.CheckableTag>
                ))
              )}
            </Space>
          </Form.Item>

          <Form.Item name="aktif" label={t('events.eventActive')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>

        {editingId && (
          <Popconfirm title={t('events.deleteTitle')} okText="Sil" cancelText={t('events.cancel')} okButtonProps={{ danger: true }} onConfirm={() => handleDelete(editingId)}>
            <Button danger icon={<DeleteOutlined />} block>{t('events.delete')}</Button>
          </Popconfirm>
        )}
      </Drawer>
    </div>
  );
}
