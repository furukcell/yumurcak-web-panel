import React, { useEffect, useState, useMemo } from 'react';
import { Typography, Table, Button, Drawer, Form, Input, Select, message, Empty, Tag } from 'antd';
import { PlusOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { ref, onValue, get, update } from 'firebase/database';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { generateId, asArray } from '../utils/crudHelpers';
import { usernameToEmail, normalizeUsername } from '../utils/authHelpers';
import { getSecondaryAuth } from '../utils/secondaryAuth';

const { Title, Text } = Typography;

// Mobildeki VeliListScreen.js + VeliFormScreen.js'in web karşılığı.
export default function ParentsPage() {
  const { kullanici, kres } = useAuth();
  const kresId = kres?.id || kullanici?.kresId;

  const [veliler, setVeliler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [siniflar, setSiniflar] = useState([]);
  const [seciliSinifId, setSeciliSinifId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
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
              ad: `${v.ad || ''} ${v.soyad || ''}`.trim() || v.kullaniciAdi || 'İsimsiz veli',
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
      const veliSnap = await get(ref(database, `kullanicilar/${id}`));
      const oldVeli = veliSnap.exists() ? veliSnap.val() || {} : {};

      if (editingId && oldVeli.authUid && (values.sifre || '').trim()) {
        message.error('Bu veli Firebase Auth hesabına bağlı. Mevcut kullanıcının şifresi bu ekrandan değiştirilemez.');
        setSaving(false);
        return;
      }

      const kaydedilenSifre = (values.sifre || '').trim() || oldVeli.sifre || '123456';
      if (kaydedilenSifre.length < 6) {
        message.error('Şifre en az 6 karakter olmalı');
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
      message.success(editingId ? 'Veli güncellendi' : 'Veli kaydedildi');
      setDrawerOpen(false);
    } catch (error) {
      console.error(error);
      if (error?.code === 'auth/email-already-in-use') {
        message.error('Bu kullanıcı adı için Firebase Auth hesabı zaten var. Farklı kullanıcı adı dene.');
      } else {
        message.error(`Veli kaydedilemedi. ${error?.code || error?.message || ''}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: 'Ad Soyad', dataIndex: 'ad', key: 'ad' },
    { title: 'Kullanıcı Adı', dataIndex: 'kullaniciAdi', key: 'kullaniciAdi', render: (v) => `@${v}` },
    { title: 'Telefon', dataIndex: 'telefon', key: 'telefon' },
    {
      title: 'Çocuklar',
      key: 'cocuklar',
      render: (_, r) =>
        r.cocuklar.length ? (
          <>
            {r.cocuklar.map((c) => (
              <Tag key={c.id} color="purple" style={{ marginBottom: 4 }}>{c.ad}{c.sinifAd ? ` (${c.sinifAd})` : ''}</Tag>
            ))}
          </>
        ) : (
          <Text type="secondary">Bağlı çocuk yok</Text>
        ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Veliler</Title>
          <Text type="secondary">{veliler.length} kayıtlı veli</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Veli Ekle</Button>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <Select
          allowClear
          placeholder="Sınıfa göre filtrele"
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
        locale={{ emptyText: <Empty description="Henüz kayıtlı veli yok" /> }}
        pagination={{ pageSize: 10 }}
      />

      <Drawer
        title={editingId ? 'Veliyi Düzenle' : 'Yeni Veli'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
        extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? 'Güncelle' : 'Oluştur'}</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="kullaniciAdi" label="Kullanıcı Adı" rules={[{ required: true, message: 'Kullanıcı adı zorunlu' }]}>
            <Input placeholder="Örn: veli1" autoCapitalize="none" />
          </Form.Item>
          <Form.Item name="ad" label="Ad Soyad" rules={[{ required: true, message: 'Ad soyad zorunlu' }]}>
            <Input placeholder="Örn: Mehmet Yılmaz" />
          </Form.Item>
          <Form.Item name="telefon" label="Telefon">
            <Input placeholder="05xx xxx xx xx" />
          </Form.Item>
          <Form.Item
            name="sifre"
            label="Şifre"
            extra={editingId ? 'Boş bırakılırsa mevcut şifre korunur.' : 'Boş bırakılırsa varsayılan şifre 123456 olur.'}
          >
            <Input.Password placeholder={editingId ? 'Boş bırakılırsa değişmez' : 'Boş bırakılırsa: 123456'} iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
