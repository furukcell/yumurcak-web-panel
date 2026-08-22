import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Table, Button, Drawer, Form, Input, Tag, message, Empty, Spin, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ref, onValue, get, update } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { YAS_GRUPLARI } from '../constants';
import { generateId, asArray } from '../utils/crudHelpers';
import { calculateChildAge, getChildBirthDate } from '../utils/childDates';

const { Title, Text } = Typography;

// Mobildeki ClassListScreen.js + ClassFormScreen.js'in web karşılığı.
export default function ClassesPage() {
  const { kullanici, kres } = useAuth();
  const kresId = kres?.id || kullanici?.kresId;

  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [classChildren, setClassChildren] = useState([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!kresId) {
      setClasses([]);
      setLoading(false);
      return;
    }

    const indexRef = ref(database, `kresSiniflari/${kresId}`);
    const unsubscribe = onValue(indexRef, async (snapshot) => {
      const idsData = snapshot.val();
      if (!idsData) {
        setClasses([]);
        setLoading(false);
        return;
      }

      const classIds = Object.keys(idsData);
      try {
        const results = await Promise.all(
          classIds.map(async (id) => {
            const [classSnap, childrenIndexSnap] = await Promise.all([
              get(ref(database, `siniflar/${id}`)),
              get(ref(database, `sinifCocuklari/${id}`)),
            ]);
            if (!classSnap.exists()) return null;
            const childCount = childrenIndexSnap.exists() ? Object.keys(childrenIndexSnap.val()).length : 0;
            return { id, ...classSnap.val(), childCount };
          })
        );

        setClasses(results.filter(Boolean).sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr')));
        setLoading(false);
      } catch (error) {
        console.warn('Sınıf listesi çekme hatası:', error);
        setClasses([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [kresId]);

  const toplamOgretmen = useMemo(() => classes.reduce((total, item) => total + (item.ogretmenIds?.length || 0), 0), [classes]);

  const loadClassChildren = async (classId) => {
    setChildrenLoading(true);
    try {
      const indexSnap = await get(ref(database, `sinifCocuklari/${classId}`));
      const idsData = indexSnap.exists() ? indexSnap.val() : null;
      if (!idsData) {
        setClassChildren([]);
        setChildrenLoading(false);
        return;
      }

      const childIds = Object.keys(idsData);
      const results = await Promise.all(
        childIds.map((id) => get(ref(database, `cocuklar/${id}`)).then((s) => (s.exists() ? { id, ...s.val() } : null)))
      );

      const list = results
        .filter(Boolean)
        .map((c) => ({
          id: c.id,
          ad: `${c.ad || ''} ${c.soyad || ''}`.trim() || c.ad || c.id,
          yas: calculateChildAge(getChildBirthDate(c)),
        }))
        .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

      setClassChildren(list);
      setChildrenLoading(false);
    } catch (error) {
      console.warn('Sınıf çocukları çekme hatası:', error);
      setClassChildren([]);
      setChildrenLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setClassChildren([]);
    setDrawerOpen(true);
  };

  const openEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({ ad: record.ad, yasGrubu: record.yasGrubu });
    setDrawerOpen(true);
    loadClassChildren(record.id);
  };

  const handleSave = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSaving(true);
    try {
      const id = editingId || generateId();
      const classRef = ref(database, `siniflar/${id}`);
      const existingSnap = editingId ? await get(classRef) : null;
      const existingData = existingSnap?.exists?.() ? existingSnap.val() || {} : {};
      const existingTeacherIds = asArray(existingData.ogretmenIds);
      const now = Date.now();
      const nextKresId = existingData.kresId || kresId || 'default-kres';

      const classData = {
        ...existingData,
        ad: values.ad.trim(),
        yasGrubu: values.yasGrubu,
        ogretmenIds: existingTeacherIds,
        kresId: nextKresId,
        createdAt: existingData.createdAt || now,
        updatedAt: now,
      };

      const updates = {
        [`siniflar/${id}`]: classData,
        [`kresSiniflari/${nextKresId}/${id}`]: true,
      };

      if (existingData.kresId && existingData.kresId !== nextKresId) {
        updates[`kresSiniflari/${existingData.kresId}/${id}`] = null;
      }
      existingTeacherIds.forEach((teacherId) => {
        if (teacherId) updates[`ogretmenSiniflari/${teacherId}/${id}`] = true;
      });

      await update(ref(database), updates);
      message.success(editingId ? 'Sınıf güncellendi' : 'Sınıf kaydedildi');
      setDrawerOpen(false);
    } catch (error) {
      console.error(error);
      message.error('Sınıf kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: 'Sınıf Adı', dataIndex: 'ad', key: 'ad', render: (v) => v || 'İsimsiz Sınıf' },
    { title: 'Yaş Grubu', dataIndex: 'yasGrubu', key: 'yasGrubu', render: (v) => v || <Text type="secondary">Belirtilmemiş</Text> },
    { title: '👩‍🏫 Öğretmen', key: 'teacherCount', render: (_, r) => r.ogretmenIds?.length || 0 },
    { title: '👶 Çocuk', key: 'childCount', render: (_, r) => r.childCount || 0 },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Sınıflar</Title>
          <Text type="secondary">Kurumdaki sınıfları ve öğretmen eşleşmelerini yönetin.</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Sınıf Ekle</Button>
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 20, background: THEME.primarySoft, borderRadius: 16, padding: '14px 20px' }}>
        <div><Text strong style={{ color: THEME.primary, fontSize: 22 }}>{classes.length}</Text><br /><Text type="secondary">Sınıf</Text></div>
        <div><Text strong style={{ color: THEME.primary, fontSize: 22 }}>{toplamOgretmen}</Text><br /><Text type="secondary">Öğretmen Ataması</Text></div>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={classes}
        onRow={(record) => ({ onClick: () => openEdit(record), style: { cursor: 'pointer' } })}
        locale={{ emptyText: <Empty description="Henüz sınıf eklenmemiş" /> }}
        pagination={{ pageSize: 10 }}
      />

      <Drawer
        title={editingId ? 'Sınıfı Düzenle' : 'Yeni Sınıf'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
        extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? 'Güncelle' : 'Oluştur'}</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="ad" label="Sınıf Adı" rules={[{ required: true, message: 'Sınıf adı zorunlu' }]}>
            <Input placeholder="Örn: Papatya Sınıfı" />
          </Form.Item>
          <Form.Item name="yasGrubu" label="Yaş Grubu" rules={[{ required: true, message: 'Yaş grubu zorunlu' }]}>
            <Space wrap>
              {YAS_GRUPLARI.map((item) => (
                <YasChip key={item.key} item={item} form={form} />
              ))}
            </Space>
          </Form.Item>
        </Form>

        {editingId && (
          <div style={{ marginTop: 24, borderTop: `1px solid ${THEME.border}`, paddingTop: 16 }}>
            <Text strong>Bu Sınıftaki Çocuklar {childrenLoading ? '' : `(${classChildren.length})`}</Text>
            {childrenLoading ? (
              <div style={{ textAlign: 'center', marginTop: 12 }}><Spin /></div>
            ) : classChildren.length === 0 ? (
              <div style={{ marginTop: 8 }}><Text type="secondary">Bu sınıfa henüz çocuk atanmamış.</Text></div>
            ) : (
              <div style={{ marginTop: 10 }}>
                {classChildren.map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${THEME.border}` }}>
                    <Text>{c.ad}</Text>
                    {c.yas && <Tag color="purple">{c.yas}</Tag>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function YasChip({ item, form }) {
  const value = Form.useWatch('yasGrubu', form);
  const active = value === item.label;
  return (
    <Tag.CheckableTag checked={active} onChange={() => form.setFieldsValue({ yasGrubu: item.label })}>
      {item.label}
    </Tag.CheckableTag>
  );
}
