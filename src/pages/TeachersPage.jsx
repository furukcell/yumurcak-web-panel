import React, { useEffect, useState } from 'react';
import { Typography, Table, Button, Drawer, Form, Input, Select, Tag, message, Empty, Space } from 'antd';
import { PlusOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { ref, onValue, get, update, query, orderByChild, equalTo } from 'firebase/database';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { generateId } from '../utils/crudHelpers';
import { usernameToEmail, normalizeUsername } from '../utils/authHelpers';
import { getSecondaryAuth } from '../utils/secondaryAuth';

const { Title, Text } = Typography;

// Mobildeki TeacherListScreen.js + TeacherFormScreen.js'in web karşılığı.
export default function TeachersPage() {
  const { kullanici, kres } = useAuth();
  const kresId = kres?.id || kullanici?.kresId;

  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [siniflar, setSiniflar] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // ── Öğretmen listesi (mobildeki TeacherListScreen.js mantığı) ─────
  useEffect(() => {
    if (!kresId) {
      setTeachers([]);
      setLoading(false);
      return;
    }

    const ogretmenIndexRef = ref(database, `kresKullanicilari/${kresId}/ogretmenler`);
    const sinifIndexRef = ref(database, `kresSiniflari/${kresId}`);

    let ogretmenIds = [];
    let sinifIds = [];
    let ogretmenLoaded = false;
    let sinifLoaded = false;

    async function buildList() {
      if (!ogretmenLoaded || !sinifLoaded) return;
      try {
        const sinifResults = await Promise.all(
          sinifIds.map((id) => get(ref(database, `siniflar/${id}`)).then((s) => (s.exists() ? { id, ...s.val() } : null)))
        );
        const sinifListesi = sinifResults.filter(Boolean);
        setSiniflar(sinifListesi);

        const ogretmenResults = await Promise.all(
          ogretmenIds.map((id) => get(ref(database, `kullanicilar/${id}`)).then((s) => (s.exists() ? [id, s.val()] : null)))
        );
        const kullanicilarMap = Object.fromEntries(ogretmenResults.filter(Boolean));

        const ogretmenler = ogretmenIds
          .filter((id) => kullanicilarMap[id])
          .map((id) => {
            const u = kullanicilarMap[id];
            const atanmisSiniflar = sinifListesi.filter((s) => Array.isArray(s.ogretmenIds) && s.ogretmenIds.includes(id));
            const adSoyad = `${u.ad || ''} ${u.soyad || ''}`.trim();
            const sinifAdlari = atanmisSiniflar.map((s) => s.ad).filter(Boolean);
            const sinifIdleri = atanmisSiniflar.map((s) => s.id);

            return {
              id,
              ad: adSoyad || u.kullaniciAdi || 'İsimsiz öğretmen',
              kullaniciAdi: u.kullaniciAdi || '-',
              telefon: u.telefon || u.tel || '-',
              email: u.email || '-',
              aktif: u.aktif !== false,
              sinifAdlari,
              sinifIdleri,
              sinifId: sinifIdleri[0] || '',
            };
          })
          .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

        setTeachers(ogretmenler);
        setLoading(false);
      } catch (error) {
        console.warn('Öğretmen listesi çekme hatası:', error);
        setTeachers([]);
        setLoading(false);
      }
    }

    const ogretmenUnsub = onValue(ogretmenIndexRef, (snap) => {
      const data = snap.val();
      ogretmenIds = data ? Object.keys(data) : [];
      ogretmenLoaded = true;
      buildList();
    });

    const sinifUnsub = onValue(sinifIndexRef, (snap) => {
      const data = snap.val();
      sinifIds = data ? Object.keys(data) : [];
      sinifLoaded = true;
      buildList();
    });

    return () => {
      ogretmenUnsub();
      sinifUnsub();
    };
  }, [kresId]);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({ kullaniciAdi: record.kullaniciAdi, ad: record.ad, sinifId: record.sinifId, sifre: '' });
    setDrawerOpen(true);
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
      const now = Date.now();
      const nextSinifId = values.sinifId || '';
      const teacherSnap = await get(ref(database, `kullanicilar/${id}`));
      const oldTeacher = teacherSnap.exists() ? teacherSnap.val() || {} : {};

      // NOT: Mobil TeacherFormScreen.js'de bu kontrol eksikti (VeliFormScreen.js'de
      // vardı) — mevcut bir Firebase Auth hesabının şifresi bu ekrandan
      // değiştirilemez, çünkü sadece DB'deki 'sifre' alanı güncellenir, gerçek
      // Auth şifresi değişmez ve öğretmen giriş yapamaz hale gelir. Tutarlılık
      // için web tarafında bu güvenli davranış uygulandı.
      if (editingId && oldTeacher.authUid && (values.sifre || '').trim()) {
        message.error('Bu öğretmen Firebase Auth hesabına bağlı. Mevcut kullanıcının şifresi bu ekrandan değiştirilemez.');
        setSaving(false);
        return;
      }

      const kaydedilenSifre = (values.sifre || '').trim() || oldTeacher.sifre || '123456';

      if (kaydedilenSifre.length < 6) {
        message.error('Şifre en az 6 karakter olmalı');
        setSaving(false);
        return;
      }

      const email = oldTeacher.email || usernameToEmail(values.kullaniciAdi.trim());
      let authUid = oldTeacher.authUid || null;

      if (!authUid) {
        const secondaryAuth = getSecondaryAuth('yumurcak-teacher-create');
        const credential = await createUserWithEmailAndPassword(secondaryAuth, email, kaydedilenSifre);
        authUid = credential.user.uid;
        await signOut(secondaryAuth).catch(() => {});
      }

      const nextKresId = oldTeacher.kresId || kresId || 'default-kres';

      const siniflarQ = query(ref(database, 'siniflar'), orderByChild('kresId'), equalTo(nextKresId));
      const siniflarSnap = await get(siniflarQ);
      const siniflarData = siniflarSnap.exists() ? siniflarSnap.val() || {} : {};

      const nextUsername = values.kullaniciAdi.trim();
      const cleanNewUsername = normalizeUsername(nextUsername);
      const cleanOldUsername = oldTeacher.kullaniciAdi ? normalizeUsername(oldTeacher.kullaniciAdi) : null;

      const updates = {};
      updates[`kullanicilar/${id}`] = {
        ...oldTeacher,
        kullaniciAdi: nextUsername,
        sifre: kaydedilenSifre,
        ad: values.ad.trim(),
        rol: 'ogretmen',
        sinifId: nextSinifId,
        kresId: nextKresId,
        authUid,
        email,
        authProvider: 'firebase',
        authCreatedAt: oldTeacher.authCreatedAt || now,
        authUpdatedAt: now,
        createdAt: oldTeacher.createdAt || now,
        updatedAt: now,
      };

      updates[`authKullaniciIndex/${authUid}`] = id;
      updates[`kresKullanicilari/${nextKresId}/ogretmenler/${id}`] = true;
      updates[`kullaniciKresleri/${id}/${nextKresId}`] = true;
      if (oldTeacher.kresId && oldTeacher.kresId !== nextKresId) updates[`kresKullanicilari/${oldTeacher.kresId}/ogretmenler/${id}`] = null;

      if (cleanNewUsername) updates[`kullaniciAdiIndex/${cleanNewUsername}`] = id;
      if (cleanOldUsername && cleanOldUsername !== cleanNewUsername) updates[`kullaniciAdiIndex/${cleanOldUsername}`] = null;

      Object.entries(siniflarData).forEach(([classId, classData]) => {
        const mevcutIds = Array.isArray(classData?.ogretmenIds) ? classData.ogretmenIds.map(String) : [];
        if (mevcutIds.includes(String(id)) && classId !== nextSinifId) {
          updates[`siniflar/${classId}/ogretmenIds`] = mevcutIds.filter((teacherItemId) => teacherItemId !== String(id));
          updates[`siniflar/${classId}/updatedAt`] = now;
          updates[`ogretmenSiniflari/${id}/${classId}`] = null;
        }
      });

      if (nextSinifId) {
        const targetClass = siniflarData[nextSinifId] || {};
        const targetIds = Array.isArray(targetClass.ogretmenIds) ? targetClass.ogretmenIds.map(String) : [];
        const classKresId = targetClass.kresId || nextKresId;
        updates[`siniflar/${nextSinifId}/ogretmenIds`] = Array.from(new Set([...targetIds, String(id)]));
        updates[`siniflar/${nextSinifId}/kresId`] = classKresId;
        updates[`siniflar/${nextSinifId}/updatedAt`] = now;
        updates[`ogretmenSiniflari/${id}/${nextSinifId}`] = true;
        updates[`kresSiniflari/${classKresId}/${nextSinifId}`] = true;
      }

      await update(ref(database), updates);
      message.success(editingId ? 'Öğretmen güncellendi' : 'Öğretmen kaydedildi');
      setDrawerOpen(false);
    } catch (error) {
      console.error(error);
      if (error?.code === 'auth/email-already-in-use') {
        message.error('Bu kullanıcı adı için Firebase Auth hesabı zaten var. Farklı kullanıcı adı dene.');
      } else {
        message.error(`Öğretmen kaydedilemedi. ${error?.code || error?.message || ''}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const aktifSayisi = teachers.filter((t) => t.aktif).length;
  const atanmisSayisi = teachers.filter((t) => t.sinifAdlari.length > 0).length;

  const columns = [
    { title: 'Ad Soyad', dataIndex: 'ad', key: 'ad' },
    { title: 'Kullanıcı Adı', dataIndex: 'kullaniciAdi', key: 'kullaniciAdi', render: (v) => `@${v}` },
    { title: 'Sınıf', key: 'sinif', render: (_, r) => (r.sinifAdlari.length ? r.sinifAdlari.join(', ') : <Text type="secondary">Atanmamış</Text>) },
    { title: 'Telefon', dataIndex: 'telefon', key: 'telefon' },
    { title: 'Durum', key: 'aktif', render: (_, r) => <Tag color={r.aktif ? 'green' : 'red'}>{r.aktif ? 'Aktif' : 'Pasif'}</Tag> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Öğretmenler</Title>
          <Text type="secondary">{teachers.length} öğretmen · {aktifSayisi} aktif · {atanmisSayisi} sınıfa atanmış</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Öğretmen Ekle</Button>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={teachers}
        onRow={(record) => ({ onClick: () => openEdit(record), style: { cursor: 'pointer' } })}
        locale={{ emptyText: <Empty description="Henüz kayıtlı öğretmen yok" /> }}
        pagination={{ pageSize: 10 }}
      />

      <Drawer
        title={editingId ? 'Öğretmeni Düzenle' : 'Yeni Öğretmen'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
        extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? 'Güncelle' : 'Oluştur'}</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="kullaniciAdi" label="Kullanıcı Adı" rules={[{ required: true, message: 'Kullanıcı adı zorunlu' }]}>
            <Input placeholder="Örn: ogretmen1" autoCapitalize="none" />
          </Form.Item>
          <Form.Item name="ad" label="Ad Soyad" rules={[{ required: true, message: 'Ad soyad zorunlu' }]}>
            <Input placeholder="Örn: Ayşe Yılmaz" />
          </Form.Item>
          <Form.Item
            name="sifre"
            label="Şifre"
            extra={editingId ? 'Boş bırakılırsa mevcut şifre korunur.' : 'Boş bırakılırsa varsayılan şifre 123456 olur.'}
          >
            <Input.Password placeholder={editingId ? 'Boş bırakılırsa değişmez' : 'Boş bırakılırsa: 123456'} iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)} />
          </Form.Item>
          <Form.Item name="sinifId" label="Sınıf Ata (opsiyonel)">
            <Select
              allowClear
              placeholder={siniflar.length === 0 ? 'Önce sınıf oluşturun' : 'Sınıf seçin'}
              disabled={siniflar.length === 0}
              options={siniflar.map((s) => ({ value: s.id, label: `${s.ad} — ${s.yasGrubu}` }))}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
