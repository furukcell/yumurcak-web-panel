import React, { useEffect, useState } from 'react';
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
            adSoyad: `${u.ad || ''} ${u.soyad || ''}`.trim() || u.kullaniciAdi || 'İsimsiz yönetici',
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
      message.error('Kendi hesabını pasif yapamazsın.');
      return;
    }
    if (editingId && values.aktif === false) {
      const kalanAktif = yoneticiler.filter((y) => y.id !== editingId && y.aktif).length;
      if (kalanAktif === 0) {
        message.error('En az bir aktif yönetici hesabı kalmalı.');
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
        message.error('Bu yönetici Firebase Auth hesabına bağlı. Mevcut kullanıcının şifresi bu ekrandan değiştirilemez.');
        setSaving(false);
        return;
      }

      const kaydedilenSifre = (values.sifre || '').trim() || oldAdmin.sifre || '123456';
      if (kaydedilenSifre.length < 6) {
        message.error('Şifre en az 6 karakter olmalı');
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
      message.success(editingId ? 'Yönetici güncellendi' : 'Yönetici oluşturuldu');
      setDrawerOpen(false);

      denetimKaydiYaz({
        kresId: nextKresId,
        kullanici,
        islem: editingId ? 'guncelle' : 'ekle',
        modul: 'Yöneticiler',
        hedef: `${values.ad.trim()} ${values.soyad.trim()}`.trim(),
      });
    } catch (error) {
      console.error(error);
      if (error?.code === 'auth/email-already-in-use') {
        message.error('Bu kullanıcı adı için Firebase Auth hesabı zaten var. Farklı kullanıcı adı dene.');
      } else {
        message.error(`Yönetici kaydedilemedi. ${error?.code || error?.message || ''}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record) => {
    if (record.id === (kullanici?.uid || kullanici?.id)) {
      message.error('Kendi hesabını silemezsin.');
      return;
    }
    const kalanAktif = yoneticiler.filter((y) => y.id !== record.id && y.aktif).length;
    if (record.aktif && kalanAktif === 0) {
      message.error('En az bir aktif yönetici hesabı kalmalı.');
      return;
    }
    setDeletingId(record.id);
    try {
      await deleteKullaniciHesabi(record.id);
      message.success('Yönetici silindi');
      denetimKaydiYaz({ kresId, kullanici, islem: 'sil', modul: 'Yöneticiler', hedef: record.adSoyad });
    } catch (error) {
      console.error(error);
      message.error(`Yönetici silinemedi. ${error?.message || ''}`);
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
      title: 'Ad Soyad',
      dataIndex: 'adSoyad',
      key: 'adSoyad',
      render: (v, r) => (
        <Space size={6}>
          <Text strong>{v}</Text>
          {r.id === (kullanici?.uid || kullanici?.id) && <Tag color="purple" style={{ marginInlineEnd: 0 }}>Sen</Tag>}
        </Space>
      ),
    },
    { title: 'Kullanıcı Adı', dataIndex: 'kullaniciAdi', key: 'kullaniciAdi', render: (v) => `@${v}` },
    { title: 'Telefon', dataIndex: 'telefon', key: 'telefon' },
    { title: 'Durum', key: 'aktif', render: (_, r) => <Tag color={r.aktif ? 'green' : 'red'}>{r.aktif ? 'Aktif' : 'Pasif'}</Tag> },
    {
      title: '',
      key: 'sil',
      width: 48,
      render: (_, r) => (
        <Popconfirm
          title="Yönetici silinsin mi?"
          description="Bu işlem geri alınamaz: hesap ve Firebase Auth girişi tamamen silinir."
          okText="Sil"
          okButtonProps={{ danger: true }}
          cancelText="Vazgeç"
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
            <Title level={3} style={{ margin: 0 }}>Yöneticiler</Title>
          </div>
          <Text type="secondary">{yoneticiler.length} yönetici · {aktifSayisi} aktif</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Yönetici Ekle</Button>
      </div>

      <Input.Search
        placeholder="Yönetici, kullanıcı adı veya telefona göre ara"
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
        locale={{ emptyText: <Empty description="Henüz kayıtlı yönetici yok" /> }}
        pagination={{ pageSize: 10 }}
      />

      <Drawer
        title={editingId ? 'Yöneticiyi Düzenle' : 'Yeni Yönetici'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
        extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? 'Güncelle' : 'Oluştur'}</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="kullaniciAdi" label="Kullanıcı Adı" rules={[{ required: true, message: 'Kullanıcı adı zorunlu' }]}>
            <Input placeholder="Örn: yonetici2" autoCapitalize="none" />
          </Form.Item>
          <Form.Item name="ad" label="Ad" rules={[{ required: true, message: 'Ad zorunlu' }]}>
            <Input placeholder="Örn: Ayşe" />
          </Form.Item>
          <Form.Item name="soyad" label="Soyad" rules={[{ required: true, message: 'Soyad zorunlu' }]}>
            <Input placeholder="Örn: Yılmaz" />
          </Form.Item>
          <Form.Item name="telefon" label="Telefon (opsiyonel)">
            <Input placeholder="Örn: 0555 000 00 00" />
          </Form.Item>
          <Form.Item
            name="sifre"
            label="Şifre"
            extra={editingId ? 'Boş bırakılırsa mevcut şifre korunur.' : 'Boş bırakılırsa varsayılan şifre 123456 olur.'}
          >
            <Input.Password placeholder={editingId ? 'Boş bırakılırsa değişmez' : 'Boş bırakılırsa: 123456'} iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)} />
          </Form.Item>
          {editingId && (
            <Form.Item name="aktif" label="Hesap Durumu" valuePropName="checked">
              <Switch checkedChildren="Aktif" unCheckedChildren="Pasif" />
            </Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  );
}
