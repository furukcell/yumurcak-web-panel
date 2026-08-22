import React, { useEffect, useState } from 'react';
import { Typography, List, Button, Drawer, Form, Input, Switch, Tag, message, Empty, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ref, onValue, get, set, push, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { createRoleNotification, createUserNotification } from '../utils/notificationCenter';

const { Title, Text, Paragraph } = Typography;

const TARGET_OPTIONS = [
  { key: 'all', label: 'Tüm Kurum', icon: '🏫' },
  { key: 'veli', label: 'Veliler', icon: '👨‍👩‍👧' },
  { key: 'ogretmen', label: 'Öğretmenler', icon: '👩‍🏫' },
  { key: 'sinif', label: 'Sınıf', icon: '📚' },
];

// Mobildeki AnnouncementListScreen.js + AnnouncementFormScreen.js'in web karşılığı.
export default function AnnouncementsPage() {
  const { kullanici, kres } = useAuth();
  const kresId = kres?.id || kullanici?.kresId || 'default-kres';

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [targetRole, setTargetRole] = useState('all');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    if (!kresId) {
      setAnnouncements([]);
      setLoading(false);
      return;
    }
    const q = query(ref(database, 'duyurular'), orderByChild('kresId'), equalTo(kresId));
    const unsubscribe = onValue(
      q,
      (snap) => {
        const data = snap.val();
        const list = data ? Object.entries(data).map(([id, val]) => ({ id, ...val })) : [];
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setAnnouncements(list);
        setLoading(false);
      },
      () => {
        setAnnouncements([]);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [kresId]);

  useEffect(() => {
    (async () => {
      try {
        const q = query(ref(database, 'siniflar'), orderByChild('kresId'), equalTo(kresId));
        const snap = await get(q);
        const data = snap.val() || {};
        const list = Object.entries(data)
          .map(([id, value]) => ({ id, ...value }))
          .sort((a, b) => String(a.ad || '').localeCompare(String(b.ad || ''), 'tr'));
        setClasses(list);
      } catch (err) {
        console.warn('Sınıflar yüklenemedi:', err);
      }
    })();
  }, [kresId]);

  const getClassTeacherUserIds = async (sinifId) => {
    try {
      const sinifSnap = await get(ref(database, `siniflar/${sinifId}`));
      const sinifData = sinifSnap.val() || {};
      const ogretmenIds = sinifData.ogretmenIds ? (Array.isArray(sinifData.ogretmenIds) ? sinifData.ogretmenIds : Object.keys(sinifData.ogretmenIds)) : [];
      return [...new Set(ogretmenIds.filter(Boolean))];
    } catch {
      return [];
    }
  };

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setTargetRole('all');
    setSelectedClassId('');
    setDrawerOpen(true);
  };

  const openEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({ title: record.title || record.baslik, message: record.message || record.icerik, isUrgent: record.priority === 'urgent' });
    setTargetRole(record.targetRole || 'all');
    setSelectedClassId(record.sinifId || '');
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    if (targetRole === 'sinif' && !selectedClassId) {
      message.error('Sınıf bazlı duyuru için bir sınıf seçmelisin.');
      return;
    }

    setSaving(true);
    try {
      const data = {
        title: values.title.trim(),
        baslik: values.title.trim(),
        message: values.message.trim(),
        icerik: values.message.trim(),
        kresId,
        sentBy: 'admin',
        priority: values.isUrgent ? 'urgent' : 'normal',
        targetRole,
        sinifId: targetRole === 'sinif' ? selectedClassId : '',
        updatedAt: Date.now(),
      };

      if (editingId) {
        const existingSnap = await get(ref(database, `duyurular/${editingId}`));
        const existing = existingSnap.exists() ? existingSnap.val() : {};
        await set(ref(database, `duyurular/${editingId}`), { ...existing, ...data, createdAt: existing.createdAt || Date.now() });
      } else {
        await push(ref(database, 'duyurular'), { ...data, createdAt: Date.now() });

        // NOT: Veliye giden bildirim mobil tarafta Cloud Function tarafından
        // (createNotificationOnAnnouncementCreate) otomatik gönderiliyor —
        // burada tekrar göndermiyoruz. Öğretmene giden bildirim mobil gibi
        // client-side'dan gönderiliyor.
        const baslikBildirim = values.isUrgent ? '🚨 Acil duyuru' : '📢 Yeni duyuru';
        const createdBy = kullanici?.uid || kullanici?.id || '';

        if (targetRole === 'sinif') {
          const teacherIds = await getClassTeacherUserIds(selectedClassId);
          if (teacherIds.length > 0) {
            await createUserNotification({ kresId, userIds: teacherIds, baslik: baslikBildirim, mesaj: values.title.trim(), tip: 'duyuru', routeName: 'TeacherAnnouncements', createdBy });
          }
        } else if (targetRole === 'ogretmen' || targetRole === 'all') {
          await createRoleNotification({ kresId, roles: ['ogretmen'], baslik: baslikBildirim, mesaj: values.title.trim(), tip: 'duyuru', routeName: 'TeacherAnnouncements', createdBy });
        }
      }

      message.success(editingId ? 'Duyuru güncellendi' : 'Duyuru gönderildi');
      setDrawerOpen(false);
    } catch (error) {
      console.error(error);
      message.error('Bir sorun oluştu');
    } finally {
      setSaving(false);
    }
  };

  const getTargetLabel = (role) => TARGET_OPTIONS.find((t) => t.key === role)?.label || 'Tüm Kurum';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Duyurular</Title>
          <Text type="secondary">{announcements.length} duyuru</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Duyuru Ekle</Button>
      </div>

      <List
        loading={loading}
        dataSource={announcements}
        locale={{ emptyText: <Empty description="Henüz duyuru gönderilmemiş" /> }}
        renderItem={(item) => (
          <List.Item
            onClick={() => openEdit(item)}
            style={{
              cursor: 'pointer',
              background: '#fff',
              borderRadius: 14,
              padding: 16,
              marginBottom: 10,
              border: `1px solid ${item.priority === 'urgent' ? THEME.red : THEME.border}`,
              borderLeft: `4px solid ${item.priority === 'urgent' ? THEME.red : THEME.primary}`,
            }}
          >
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text strong>{item.title || item.baslik}</Text>
                <Tag color="purple">{getTargetLabel(item.targetRole)}</Tag>
              </div>
              <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 4 }}>{item.message || item.icerik}</Paragraph>
              <Text type="secondary" style={{ fontSize: 12 }}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString('tr-TR') : ''}</Text>
            </div>
          </List.Item>
        )}
      />

      <Drawer
        title={editingId ? 'Duyuruyu Düzenle' : 'Yeni Duyuru'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={440}
        extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? 'Güncelle' : 'Gönder'}</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="Başlık" rules={[{ required: true, message: 'Başlık zorunlu' }]}>
            <Input placeholder="Duyuru başlığı" />
          </Form.Item>
          <Form.Item name="message" label="Mesaj" rules={[{ required: true, message: 'Mesaj zorunlu' }]}>
            <Input.TextArea rows={4} placeholder="Duyuru mesajı" />
          </Form.Item>

          <Form.Item label="Duyuru Hedefi">
            <Space wrap>
              {TARGET_OPTIONS.map((opt) => (
                <Tag.CheckableTag key={opt.key} checked={targetRole === opt.key} onChange={() => setTargetRole(opt.key)}>
                  {opt.icon} {opt.label}
                </Tag.CheckableTag>
              ))}
            </Space>
          </Form.Item>

          {targetRole === 'sinif' && (
            <Form.Item label="Sınıf Seç" required>
              <Space wrap>
                {classes.length === 0 ? (
                  <Text type="secondary">Henüz sınıf bulunamadı.</Text>
                ) : (
                  classes.map((c) => (
                    <Tag.CheckableTag key={c.id} checked={selectedClassId === c.id} onChange={() => setSelectedClassId(c.id)}>
                      {c.ad || 'Sınıf'}
                    </Tag.CheckableTag>
                  ))
                )}
              </Space>
            </Form.Item>
          )}

          <Form.Item name="isUrgent" label="Acil Duyuru" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
