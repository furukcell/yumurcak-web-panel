import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, Table, Button, Drawer, Form, Input, Select, Tag, message, Empty, Space, Popconfirm } from 'antd';
import { PlusOutlined, EyeInvisibleOutlined, EyeTwoTone, DeleteOutlined } from '@ant-design/icons';
import { ref, onValue, get, update, query, orderByChild, equalTo } from 'firebase/database';
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

// Mobildeki TeacherListScreen.js + TeacherFormScreen.js'in web karşılığı.
export default function TeachersPage() {
  const { t } = useTranslation();
  const { kullanici, kres } = useAuth();
  const kresId = kres?.id || kullanici?.kresId;

  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [siniflar, setSiniflar] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [aramaMetni, setAramaMetni] = useState('');
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
              ad: adSoyad || u.kullaniciAdi || t('teachers.unnamed'),
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
      const teacherSnap = editingId ? await get(ref(database, `kullanicilar/${id}`)) : null;
      const oldTeacher = teacherSnap?.exists() ? teacherSnap.val() || {} : {};

      // NOT: Mobil TeacherFormScreen.js'de bu kontrol eksikti (VeliFormScreen.js'de
      // vardı) — mevcut bir Firebase Auth hesabının şifresi bu ekrandan
      // değiştirilemez, çünkü sadece DB'deki 'sifre' alanı güncellenir, gerçek
      // Auth şifresi değişmez ve öğretmen giriş yapamaz hale gelir. Tutarlılık
      // için web tarafında bu güvenli davranış uygulandı.
      if (editingId && oldTeacher.authUid && (values.sifre || '').trim()) {
        message.error(t('teachers.authPassword'));
        setSaving(false);
        return;
      }

      const kaydedilenSifre = (values.sifre || '').trim() || oldTeacher.sifre || '123456';

      if (kaydedilenSifre.length < 6) {
        message.error(t('teachers.passwordMin'));
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
        await releaseSecondaryAuth('yumurcak-teacher-create');
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
      message.success(editingId ? t('teachers.updated') : t('teachers.saved'));
      setDrawerOpen(false);

      denetimKaydiYaz({
        kresId: nextKresId,
        kullanici,
        islem: editingId ? 'guncelle' : 'ekle',
        modul: t('teachers.title'),
        hedef: values.ad.trim(),
      });
    } catch (error) {
      console.error(error);
      if (error?.code === 'auth/email-already-in-use') {
        message.error(t('teachers.authExists'));
      } else {
        message.error(`${t('teachers.saveError')} ${error?.code || error?.message || ''}`);
      }
    } finally {
      setSaving(false);
    }
  };

  // Mobil AdministratorsPage.jsx ile aynı desen: functions/index.js ->
  // deleteKullanici callable'ını çağırır, hem DB kaydını/index'lerini hem
  // de gerçek Firebase Auth hesabını siler.
  const handleDelete = async (record) => {
    setDeletingId(record.id);
    try {
      await deleteKullaniciHesabi(record.id);
      message.success(t('teachers.deleted'));
      denetimKaydiYaz({ kresId, kullanici, islem: 'sil', modul: t('teachers.title'), hedef: record.ad });
    } catch (error) {
      console.error(error);
      message.error(`${t('teachers.deleteError')} ${error?.message || ''}`);
    } finally {
      setDeletingId(null);
    }
  };

  const aktifSayisi = teachers.filter((t) => t.aktif).length;
  const atanmisSayisi = teachers.filter((t) => t.sinifAdlari.length > 0).length;

  const gorunenOgretmenler = teachers.filter((t) => {
    if (!aramaMetni.trim()) return true;
    const q = aramaMetni.trim().toLocaleLowerCase('tr');
    return `${t.ad} ${t.kullaniciAdi} ${t.telefon} ${t.sinifAdlari.join(' ')}`.toLocaleLowerCase('tr').includes(q);
  });

  const columns = [
    { title: t('teachers.name'), dataIndex: 'ad', key: 'ad' },
    { title: t('teachers.username'), dataIndex: 'kullaniciAdi', key: 'kullaniciAdi', render: (v) => `@${v}` },
    { title: t('teachers.class'), key: 'sinif', render: (_, r) => (r.sinifAdlari.length ? r.sinifAdlari.join(', ') : <Text type="secondary">{t('teachers.unassigned')}</Text>) },
    { title: t('teachers.phone'), dataIndex: 'telefon', key: 'telefon' },
    { title: t('teachers.status'), key: 'aktif', render: (_, r) => <Tag color={r.aktif ? 'green' : 'red'}>{r.aktif ? t('teachers.active') : t('teachers.inactive')}</Tag> },
    {
      title: '',
      key: 'sil',
      width: 48,
      render: (_, r) => (
        <Popconfirm
          title={t('teachers.deleteTitle')}
          description={t('teachers.deleteDesc')}
          okText={t('teachers.delete')}
          okButtonProps={{ danger: true }}
          cancelText={t('teachers.cancel')}
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
          <Title level={3} style={{ margin: 0 }}>{t('teachers.title')}</Title>
          <Text type="secondary">{t('teachers.summary', { total: teachers.length, active: aktifSayisi, assigned: atanmisSayisi })}</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('teachers.add')}</Button>
      </div>

      <Input.Search
        placeholder={t('teachers.search')}
        allowClear
        style={{ width: 300, marginBottom: 12 }}
        value={aramaMetni}
        onChange={(e) => setAramaMetni(e.target.value)}
      />

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={gorunenOgretmenler}
        onRow={(record) => ({ onClick: () => openEdit(record), style: { cursor: 'pointer' } })}
        locale={{ emptyText: <Empty description={t('teachers.empty')} /> }}
        pagination={{ pageSize: 10 }}
      />

      <Drawer
        title={editingId ? t('teachers.edit') : t('teachers.new')}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
        extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? t('teachers.update') : t('teachers.create')}</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="kullaniciAdi" label={t('teachers.username')} rules={[{ required: true, message: t('teachers.usernameRequired') }]}>
            <Input placeholder="Örn: ogretmen1" autoCapitalize="none" />
          </Form.Item>
          <Form.Item name="ad" label={t('teachers.name')} rules={[{ required: true, message: t('teachers.nameRequired') }]}>
            <Input placeholder="Örn: Ayşe Yılmaz" />
          </Form.Item>
          <Form.Item
            name="sifre"
            label={t('teachers.password')}
            extra={editingId ? t('teachers.passwordKeep') : t('teachers.passwordDefault')}
          >
            <Input.Password placeholder={editingId ? t('teachers.passwordUnchanged') : t('teachers.passwordDefaultShort')} iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)} />
          </Form.Item>
          <Form.Item name="sinifId" label={t('teachers.classAssign')}>
            <Select
              allowClear
              placeholder={siniflar.length === 0 ? t('teachers.createClassFirst') : t('teachers.selectClass')}
              disabled={siniflar.length === 0}
              options={siniflar.map((s) => ({ value: s.id, label: `${s.ad} — ${s.yasGrubu}` }))}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
