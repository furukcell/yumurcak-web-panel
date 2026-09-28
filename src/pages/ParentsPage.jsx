import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, Table, Button, Drawer, Form, Input, Select, message, Empty, Tag, Popconfirm } from 'antd';
import { PlusOutlined, EyeInvisibleOutlined, EyeTwoTone, DeleteOutlined } from '@ant-design/icons';
import { ref, onValue, get, update } from 'firebase/database';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { generateId, asArray } from '../utils/crudHelpers';
import { usernameToEmail, normalizeUsername } from '../utils/authHelpers';
import { getSecondaryAuth, releaseSecondaryAuth } from '../utils/secondaryAuth';
import { deleteKullaniciHesabi } from '../utils/userDelete';

const { Title, Text } = Typography;

// Mobildeki VeliListScreen.js + VeliFormScreen.js'in web karşılığı.
export default function ParentsPage() {
  const { t } = useTranslation();
  const { kullanici, kres } = useAuth();
  const kresId = kres?.id || kullanici?.kresId;

  const [veliler, setVeliler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [siniflar, setSiniflar] = useState([]);
  const [seciliSinifId, setSeciliSinifId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form] = Form.useForm();

  // ── Sınıf filtresi listesi ──────────────────────────────────────
  useEffect(() => {
    if (!kresId) {
      setSiniflar([]);
      return;
    }
    const unsubscribe = onValue(ref(database, `kresSiniflari/${kresId}`), async (snap) => {
      const idsData = snap.val();
      if (!idsData) {
        setSiniflar([]);
        return;
      }
      const ids = Object.keys(idsData);
      const results = await Promise.all(ids.map((id) => get(ref(database, `siniflar/${id}`)).then((s) => (s.exists() ? { id, ...s.val() } : null))));
      setSiniflar(results.filter(Boolean).sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr')));
    });
    return () => unsubscribe();
  }, [kresId]);

  // ── Veli listesi (mobildeki VeliListScreen.js mantığı) ──────────
  useEffect(() => {
    if (!kresId) {
      setVeliler([]);
      setLoading(false);
      return;
    }

    const veliIndexRef = ref(database, `kresKullanicilari/${kresId}/veliler`);
    const cocukIndexRef = ref(database, `kresCocuklari/${kresId}`);

    let veliIds = [];
    let cocukIds = [];
    let veliLoaded = false;
    let cocukLoaded = false;

    async function buildList() {
      if (!veliLoaded || !cocukLoaded) return;
      try {
        const veliResults = await Promise.all(
          veliIds.map((id) => get(ref(database, `kullanicilar/${id}`)).then((s) => (s.exists() ? [id, s.val()] : null)))
        );
        const kullanicilarMap = Object.fromEntries(veliResults.filter(Boolean));

        const cocukResults = await Promise.all(
          cocukIds.map((id) => get(ref(database, `cocuklar/${id}`)).then((s) => (s.exists() ? [id, s.val()] : null)))
        );
        const cocuklarMap = Object.fromEntries(cocukResults.filter(Boolean));

        const sinifIdSet = new Set();
        Object.values(cocuklarMap).forEach((c) => {
          if (c.sinifId) sinifIdSet.add(c.sinifId);
        });

        const sinifResults = await Promise.all(
          Array.from(sinifIdSet).map((id) => get(ref(database, `siniflar/${id}`)).then((s) => (s.exists() ? [id, s.val()] : null)))
        );
        const siniflarMap = Object.fromEntries(sinifResults.filter(Boolean));

        const liste = veliIds
          .filter((id) => kullanicilarMap[id])
          .map((id) => {
            const v = kullanicilarMap[id];
            const bagliCocuklar = Object.entries(cocuklarMap)
              .filter(([, c]) => asArray(c.veliIds).includes(id))
              .map(([cocukId, c]) => {
                const sinif = c.sinifId ? siniflarMap[c.sinifId] : null;
                return {
                  id: cocukId,
                  ad: `${c.ad || ''} ${c.soyad || ''}`.trim() || '-',
                  sinifId: c.sinifId || null,
                  sinifAd: sinif ? sinif.ad : c.sinifId || null,
                };
              });

            return {
              id,
              ad: `${v.ad || ''} ${v.soyad || ''}`.trim() || v.kullaniciAdi || t('parents.unnamed'),
              kullaniciAdi: v.kullaniciAdi || '-',
              telefon: v.telefon || '-',
              cocuklar: bagliCocuklar,
              cocukSinifIds: bagliCocuklar.map((c) => c.sinifId).filter(Boolean),
            };
          })
          .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

        setVeliler(liste);
        setLoading(false);
      } catch (error) {
        console.warn('Veli listesi çekme hatası:', error);
        setVeliler([]);
        setLoading(false);
      }
    }

    const veliUnsub = onValue(veliIndexRef, (snap) => {
      const data = snap.val();
      veliIds = data ? Object.keys(data) : [];
      veliLoaded = true;
      buildList();
    });
    const cocukUnsub = onValue(cocukIndexRef, (snap) => {
      const data = snap.val();
      cocukIds = data ? Object.keys(data) : [];
      cocukLoaded = true;
      buildList();
    });

    return () => {
      veliUnsub();
      cocukUnsub();
    };
  }, [kresId]);

  const filteredVeliler = useMemo(() => {
    if (!seciliSinifId) return veliler;
    return veliler.filter((v) => v.cocukSinifIds.includes(seciliSinifId));
  }, [veliler, seciliSinifId]);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({ kullaniciAdi: record.kullaniciAdi, ad: record.ad, telefon: record.telefon === '-' ? '' : record.telefon, sifre: '' });
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
      // Yeni veli eklerken (editingId yok) henüz var olmayan bir id için get()
      // çağırmıyoruz: database.rules.json'daki .read kuralı admin.kresId'i
      // data.child('kresId').val() ile karşılaştırıyor, veri hiç yoksa bu null
      // olup koşul hep false'a düşüyor → permission_denied. Yeni kayıtta zaten
      // oldVeli'ye ihtiyacımız yok, boş obje yeterli.
      let oldVeli = {};
      if (editingId) {
        const veliSnap = await get(ref(database, `kullanicilar/${id}`));
        oldVeli = veliSnap.exists() ? veliSnap.val() || {} : {};
      }

      if (editingId && oldVeli.authUid && (values.sifre || '').trim()) {
        message.error(t('parents.authPassword'));
        setSaving(false);
        return;
      }

      const kaydedilenSifre = (values.sifre || '').trim() || oldVeli.sifre || '123456';
      if (kaydedilenSifre.length < 6) {
        message.error(t('parents.passwordMin'));
        setSaving(false);
        return;
      }

      const email = oldVeli.email || usernameToEmail(values.kullaniciAdi.trim());
      let authUid = oldVeli.authUid || null;

      if (!authUid) {
        const secondaryAuth = getSecondaryAuth('yumurcak-parent-create');
        const credential = await createUserWithEmailAndPassword(secondaryAuth, email, kaydedilenSifre);
        authUid = credential.user.uid;
        await signOut(secondaryAuth).catch(() => {});
        await releaseSecondaryAuth('yumurcak-parent-create');
      }

      const nextKresId = oldVeli.kresId || kresId || 'default-kres';
      const nextUsername = values.kullaniciAdi.trim();
      const cleanNewUsername = normalizeUsername(nextUsername);
      const cleanOldUsername = oldVeli.kullaniciAdi ? normalizeUsername(oldVeli.kullaniciAdi) : null;

      const updates = {};
      updates[`kullanicilar/${id}`] = {
        ...oldVeli,
        kullaniciAdi: nextUsername,
        sifre: kaydedilenSifre,
        ad: values.ad.trim(),
        telefon: (values.telefon || '').trim(),
        rol: 'veli',
        kresId: nextKresId,
        authUid,
        email,
        authProvider: 'firebase',
        authCreatedAt: oldVeli.authCreatedAt || now,
        authUpdatedAt: now,
        createdAt: oldVeli.createdAt || now,
        updatedAt: now,
      };
      updates[`authKullaniciIndex/${authUid}`] = id;
      updates[`kresKullanicilari/${nextKresId}/veliler/${id}`] = true;
      updates[`kullaniciKresleri/${id}/${nextKresId}`] = true;
      if (oldVeli.kresId && oldVeli.kresId !== nextKresId) updates[`kresKullanicilari/${oldVeli.kresId}/veliler/${id}`] = null;

      if (cleanNewUsername) updates[`kullaniciAdiIndex/${cleanNewUsername}`] = id;
      if (cleanOldUsername && cleanOldUsername !== cleanNewUsername) updates[`kullaniciAdiIndex/${cleanOldUsername}`] = null;

      await update(ref(database), updates);
      message.success(editingId ? t('parents.updated') : t('parents.saved'));
      setDrawerOpen(false);
    } catch (error) {
      console.error(error);
      if (error?.code === 'auth/email-already-in-use') {
        message.error(t('parents.authExists'));
      } else {
        message.error(`${t('parents.saveError')} ${error?.code || error?.message || ''}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record) => {
    setDeletingId(record.id);
    try {
      await deleteKullaniciHesabi(record.id);
      message.success(t('parents.deleted'));
    } catch (error) {
      console.error(error);
      message.error(`${t('parents.deleteError')} ${error?.message || ''}`);
    } finally {
      setDeletingId(null);
    }
  };

  const columns = [
    { title: t('parents.name'), dataIndex: 'ad', key: 'ad' },
    { title: t('parents.username'), dataIndex: 'kullaniciAdi', key: 'kullaniciAdi', render: (v) => `@${v}` },
    { title: t('parents.phone'), dataIndex: 'telefon', key: 'telefon' },
    {
      title: t('parents.children'),
      key: 'cocuklar',
      render: (_, r) =>
        r.cocuklar.length ? (
          <>
            {r.cocuklar.map((c) => (
              <Tag key={c.id} color="purple" style={{ marginBottom: 4 }}>{c.ad}{c.sinifAd ? ` (${c.sinifAd})` : ''}</Tag>
            ))}
          </>
        ) : (
          <Text type="secondary">{t('parents.noChildren')}</Text>
        ),
    },
    {
      title: '',
      key: 'sil',
      width: 48,
      render: (_, r) => (
        <Popconfirm
          title={t('parents.deleteTitle')}
          description={t('parents.deleteDesc')}
          okText={t('parents.delete')}
          okButtonProps={{ danger: true }}
          cancelText={t('parents.cancel')}
          onConfirm={(e) => {
            e?.stopPropagation();
            handleDelete(r);
          }}
          onCancel={(e) => e?.stopPropagation()}
        >
          <Button danger type="text" icon={<DeleteOutlined />} loading={deletingId === r.id} onClick={(e) => e.stopPropagation()} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>{t('parents.title')}</Title>
          <Text type="secondary">{t('parents.summary', { count: veliler.length })}</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('parents.add')}</Button>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <Select
          allowClear
          placeholder={t('parents.filter')}
          style={{ width: '100%' }}
          value={seciliSinifId}
          onChange={setSeciliSinifId}
          options={siniflar.map((s) => ({ value: s.id, label: s.ad }))}
        />
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={filteredVeliler}
        onRow={(record) => ({ onClick: () => openEdit(record), style: { cursor: 'pointer' } })}
        locale={{ emptyText: <Empty description={t('parents.empty')} /> }}
        pagination={{ pageSize: 10 }}
      />

      <Drawer
        title={editingId ? t('parents.edit') : t('parents.new')}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
        extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? t('parents.update') : t('parents.create')}</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="kullaniciAdi" label={t('parents.username')} rules={[{ required: true, message: t('parents.usernameRequired') }]}>
            <Input placeholder={t('parents.usernamePlaceholder')} autoCapitalize="none" />
          </Form.Item>
          <Form.Item name="ad" label={t('parents.name')} rules={[{ required: true, message: t('parents.nameRequired') }]}>
            <Input placeholder={t('parents.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="telefon" label={t('parents.phone')}>
            <Input placeholder={t('parents.phonePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="sifre"
            label={t('parents.password')}
            extra={editingId ? t('parents.passwordKeep') : t('parents.passwordDefault')}
          >
            <Input.Password placeholder={editingId ? t('parents.passwordUnchanged') : t('parents.passwordDefaultShort')} iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
