import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, Table, Button, Drawer, Form, Input, Tag, message, Empty, Switch, Space, Popconfirm } from 'antd';
import { PlusOutlined, EyeInvisibleOutlined, EyeTwoTone, CrownOutlined, DeleteOutlined } from '@ant-design/icons';
import { ref, onValue, get, update } from 'firebase/database';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { generateId } from '../utils/crudHelpers';
import { usernameToEmail, normalizeUsername } from '../utils/authHelpers';
import { getSecondaryAuth, releaseSecondaryAuth } from '../utils/secondaryAuth';
import { deleteKullaniciHesabi } from '../utils/userDelete';
import { denetimKaydiYaz } from '../utils/auditLog';

const { Title, Text } = Typography;

// TeachersPage.jsx'teki desenin yönetici (rol='yonetici') karşılığı.
// Birden fazla yönetici hesabı desteklemek için: liste
// kresKullanicilari/{kresId}/yoneticiler index'inden okunur (bu index
// zaten firebaseIndexHelpers.js'de tanımlıydı, sadece kullanan bir ekran
// yoktu). Yeni hesap oluştururken ikincil Firebase App instance'ı
// kullanılır ki mevcut adminin oturumu düşmesin (bkz. secondaryAuth.js).
export default function AdministratorsPage() {
  const { t } = useTranslation();
  const { kullanici, kres } = useAuth();
  const kresId = kres?.id || kullanici?.kresId;

  const [yoneticiler, setYoneticiler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [aramaMetni, setAramaMetni] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    if (!kresId) {
      setYoneticiler([]);
      setLoading(false);
      return;
    }

    const indexRef = ref(database, `kresKullanicilari/${kresId}/yoneticiler`);

    const unsub = onValue(indexRef, async (snap) => {
      const data = snap.val();
      const ids = data ? Object.keys(data) : [];
      try {
        const results = await Promise.all(
          ids.map((id) => get(ref(database, `kullanicilar/${id}`)).then((s) => (s.exists() ? [id, s.val()] : null)))
        );
        const liste = results
          .filter(Boolean)
          .map(([id, u]) => ({
            id,
            ad: u.ad || '',
            soyad: u.soyad || '',
            adSoyad: `${u.ad || ''} ${u.soyad || ''}`.trim() || u.kullaniciAdi || t('administrators.unnamed'),
            kullaniciAdi: u.kullaniciAdi || '-',
            telefon: u.telefon || u.tel || '-',
            email: u.email || '-',
            aktif: u.aktif !== false,
          }))
          .sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'));
        setYoneticiler(liste);
        setLoading(false);
      } catch (error) {
        console.warn('Yönetici listesi çekme hatası:', error);
        setYoneticiler([]);
        setLoading(false);
      }
    });

    return () => unsub();
  }, [kresId]);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ aktif: true });
    setDrawerOpen(true);
  };

  const openEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({
      kullaniciAdi: record.kullaniciAdi,
      ad: record.ad,
      soyad: record.soyad,
      telefon: record.telefon === '-' ? '' : record.telefon,
      sifre: '',
      aktif: record.aktif,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    const isSelf = editingId === (kullanici?.uid || kullanici?.id);
    if (isSelf && values.aktif === false) {
      message.error(t('administrators.selfDeactivate'));
      return;
    }
    if (editingId && values.aktif === false) {
      const kalanAktif = yoneticiler.filter((y) => y.id !== editingId && y.aktif).length;
      if (kalanAktif === 0) {
        message.error(t('administrators.lastActive'));
        return;
      }
    }

    setSaving(true);
    try {
      const id = editingId || generateId();
      const now = Date.now();
      const adminSnap = editingId ? await get(ref(database, `kullanicilar/${id}`)) : null;
      const oldAdmin = adminSnap?.exists() ? adminSnap.val() || {} : {};

      // NOT: TeachersPage.jsx'teki aynı güvenlik kısıtı — mevcut bir
      // Firebase Auth hesabının şifresi bu ekrandan değiştirilemez.
      if (editingId && oldAdmin.authUid && (values.sifre || '').trim()) {
        message.error(t('administrators.authPassword'));
        setSaving(false);
        return;
      }

      const kaydedilenSifre = (values.sifre || '').trim() || oldAdmin.sifre || '123456';
      if (kaydedilenSifre.length < 6) {
        message.error(t('administrators.passwordMin'));
        setSaving(false);
        return;
      }

      const email = oldAdmin.email || usernameToEmail(values.kullaniciAdi.trim());
      let authUid = oldAdmin.authUid || null;

      if (!authUid) {
        const secondaryAuth = getSecondaryAuth('yumurcak-admin-create');
        const credential = await createUserWithEmailAndPassword(secondaryAuth, email, kaydedilenSifre);
        authUid = credential.user.uid;
        await signOut(secondaryAuth).catch(() => {});
        await releaseSecondaryAuth('yumurcak-admin-create');
      }

      const nextKresId = oldAdmin.kresId || kresId;
      const nextUsername = values.kullaniciAdi.trim();
      const cleanNewUsername = normalizeUsername(nextUsername);
      const cleanOldUsername = oldAdmin.kullaniciAdi ? normalizeUsername(oldAdmin.kullaniciAdi) : null;

      const updates = {};
      updates[`kullanicilar/${id}`] = {
        ...oldAdmin,
        kullaniciAdi: nextUsername,
        sifre: kaydedilenSifre,
        ad: values.ad.trim(),
        soyad: values.soyad.trim(),
        telefon: (values.telefon || '').trim(),
        rol: 'yonetici',
        kresId: nextKresId,
        authUid,
        email,
        authProvider: 'firebase',
        authCreatedAt: oldAdmin.authCreatedAt || now,
        authUpdatedAt: now,
        aktif: values.aktif !== false,
        createdAt: oldAdmin.createdAt || now,
        updatedAt: now,
      };

      updates[`authKullaniciIndex/${authUid}`] = id;
      updates[`kresKullanicilari/${nextKresId}/yoneticiler/${id}`] = true;
      updates[`kullaniciKresleri/${id}/${nextKresId}`] = true;

      if (cleanNewUsername) updates[`kullaniciAdiIndex/${cleanNewUsername}`] = id;
      if (cleanOldUsername && cleanOldUsername !== cleanNewUsername) updates[`kullaniciAdiIndex/${cleanOldUsername}`] = null;

      await update(ref(database), updates);
      message.success(editingId ? t('administrators.updated') : t('administrators.saved'));
      setDrawerOpen(false);

      denetimKaydiYaz({
        kresId: nextKresId,
        kullanici,
        islem: editingId ? 'guncelle' : 'ekle',
        modul: t('administrators.title'),
        hedef: `${values.ad.trim()} ${values.soyad.trim()}`.trim(),
      });
    } catch (error) {
      console.error(error);
      if (error?.code === 'auth/email-already-in-use') {
        message.error(t('administrators.authExists'));
      } else {
        message.error(`${t('administrators.saveError')} ${error?.code || error?.message || ''}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record) => {
    if (record.id === (kullanici?.uid || kullanici?.id)) {
      message.error(t('administrators.selfDeactivate'));
      return;
    }
    const kalanAktif = yoneticiler.filter((y) => y.id !== record.id && y.aktif).length;
    if (record.aktif && kalanAktif === 0) {
      message.error(t('administrators.lastActive'));
      return;
    }
    setDeletingId(record.id);
    try {
      await deleteKullaniciHesabi(record.id);
      message.success(t('administrators.deleted'));
      denetimKaydiYaz({ kresId, kullanici, islem: 'sil', modul: t('administrators.title'), hedef: record.adSoyad });
    } catch (error) {
      console.error(error);
      message.error(`${t('administrators.deleteError')} ${error?.message || ''}`);
    } finally {
      setDeletingId(null);
    }
  };

  const aktifSayisi = yoneticiler.filter((y) => y.aktif).length;

  const gorunenYoneticiler = yoneticiler.filter((y) => {
    if (!aramaMetni.trim()) return true;
    const q = aramaMetni.trim().toLocaleLowerCase('tr');
    return `${y.adSoyad} ${y.kullaniciAdi} ${y.telefon}`.toLocaleLowerCase('tr').includes(q);
  });

  const columns = [
    {
      title: t('administrators.fullName'),
      dataIndex: 'adSoyad',
      key: 'adSoyad',
      render: (v, r) => (
        <Space size={6}>
          <Text strong>{v}</Text>
          {r.id === (kullanici?.uid || kullanici?.id) && <Tag color="purple" style={{ marginInlineEnd: 0 }}>{t('administrators.you')}</Tag>}
        </Space>
      ),
    },
    { title: t('administrators.username'), dataIndex: 'kullaniciAdi', key: 'kullaniciAdi', render: (v) => `@${v}` },
    { title: t('administrators.phoneCol'), dataIndex: 'telefon', key: 'telefon' },
    { title: t('administrators.status'), key: 'aktif', render: (_, r) => <Tag color={r.aktif ? 'green' : 'red'}>{r.aktif ? t('administrators.active') : t('administrators.inactive')}</Tag> },
    {
      title: '',
      key: 'sil',
      width: 48,
      render: (_, r) => (
        <Popconfirm
          title={t('administrators.deleteTitle')}
          description={t('administrators.deleteDesc')}
          okText={t('administrators.delete')}
          okButtonProps={{ danger: true }}
          cancelText={t('administrators.cancel')}
          onConfirm={(e) => {
            e?.stopPropagation();
            handleDelete(r);
          }}
          onCancel={(e) => e?.stopPropagation()}
        >
          <Button
            danger
            type="text"
            icon={<DeleteOutlined />}
            loading={deletingId === r.id}
            onClick={(e) => e.stopPropagation()}
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 30, height: 30, borderRadius: 9,
                background: `${THEME.gold}1F`, color: THEME.gold,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
              }}
            >
              <CrownOutlined />
            </div>
            <Title level={3} style={{ margin: 0 }}>{t('administrators.title')}</Title>
          </div>
          <Text type="secondary">{t('administrators.summary', { total: yoneticiler.length, active: aktifSayisi })}</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('administrators.add')}</Button>
      </div>

      <Input.Search
        placeholder={t('administrators.search')}
        allowClear
        style={{ width: 300, marginBottom: 12 }}
        value={aramaMetni}
        onChange={(e) => setAramaMetni(e.target.value)}
      />

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={gorunenYoneticiler}
        onRow={(record) => ({ onClick: () => openEdit(record), style: { cursor: 'pointer' } })}
        locale={{ emptyText: <Empty description={t('administrators.empty')} /> }}
        pagination={{ pageSize: 10 }}
      />

      <Drawer
        title={editingId ? t('administrators.edit') : t('administrators.new')}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
        extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? t('administrators.update') : t('administrators.create')}</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="kullaniciAdi" label={t('administrators.username')} rules={[{ required: true, message: t('administrators.usernameRequired') }]}>
            <Input placeholder="Örn: yonetici2" autoCapitalize="none" />
          </Form.Item>
          <Form.Item name="ad" label={t('administrators.firstName')} rules={[{ required: true, message: t('administrators.firstNameRequired') }]}>
            <Input placeholder={t('administrators.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="soyad" label={t('administrators.lastName')} rules={[{ required: true, message: t('administrators.lastNameRequired') }]}>
            <Input placeholder={t('administrators.surnamePlaceholder')} />
          </Form.Item>
          <Form.Item name="telefon" label={t('administrators.phone')}>
            <Input placeholder={t('administrators.phonePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="sifre"
            label={t('administrators.password')}
            extra={editingId ? t('administrators.passwordKeep') : t('administrators.passwordDefault')}
          >
            <Input.Password placeholder={editingId ? t('administrators.passwordUnchanged') : t('administrators.passwordDefaultShort')} iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)} />
          </Form.Item>
          {editingId && (
            <Form.Item name="aktif" label={t('administrators.status')} valuePropName="checked">
              <Switch checkedChildren={t('administrators.active')} unCheckedChildren={t('administrators.inactive')} />
            </Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  );
}
