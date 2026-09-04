import React, { useEffect, useState } from 'react';
import { Typography, Table, Button, Drawer, Form, Input, Select, Radio, Segmented, Tag, message, Empty, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ref, onValue, get, update } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { generateId, asArray, bugunKey } from '../utils/crudHelpers';
import { calculateChildAge, formatChildBirthDate, getChildBirthDate, normalizeChildBirthDate, parseChildBirthDate } from '../utils/childDates';
import { denetimKaydiYaz } from '../utils/auditLog';

const { Title, Text } = Typography;

// Mobildeki ChildListScreen.js + ChildFormScreen.js'in web karşılığı.
export default function ChildrenPage() {
  const { kullanici, kres } = useAuth();
  const kresId = kres?.id || kullanici?.kresId;

  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [siniflar, setSiniflar] = useState([]);
  const [veliler, setVeliler] = useState([]);
  const [ogrenciLimiti, setOgrenciLimiti] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [yeniBaslayan, setYeniBaslayan] = useState(false);
  const [uyumDurumu, setUyumDurumu] = useState('pasif');
  const [durum, setDurum] = useState('aktif');
  const [durumFilter, setDurumFilter] = useState('aktif');
  const [aramaMetni, setAramaMetni] = useState('');
  const [form] = Form.useForm();

  // ── Çocuk listesi (mobildeki ChildListScreen.js mantığı) ──────────
  useEffect(() => {
    if (!kresId) {
      setChildren([]);
      setLoading(false);
      return;
    }

    const cocukIndexRef = ref(database, `kresCocuklari/${kresId}`);
    const unsubscribe = onValue(cocukIndexRef, async (snapshot) => {
      const idsData = snapshot.val();
      if (!idsData) {
        setChildren([]);
        setLoading(false);
        return;
      }

      try {
        const cocukIds = Object.keys(idsData);
        const cocukResults = await Promise.all(
          cocukIds.map((id) => get(ref(database, `cocuklar/${id}`)).then((s) => (s.exists() ? { id, ...s.val() } : null)))
        );
        const cocuklarArr = cocukResults.filter(Boolean);

        const sinifIdSet = new Set();
        const veliIdSet = new Set();
        cocuklarArr.forEach((c) => {
          if (c.sinifId) sinifIdSet.add(c.sinifId);
          asArray(c.veliIds).forEach((vid) => vid && veliIdSet.add(vid));
        });

        const sinifResults = await Promise.all(
          Array.from(sinifIdSet).map((id) => get(ref(database, `siniflar/${id}`)).then((s) => (s.exists() ? [id, s.val()] : null)))
        );
        const siniflarMap = Object.fromEntries(sinifResults.filter(Boolean));

        Object.values(siniflarMap).forEach((sinif) => {
          asArray(sinif.ogretmenIds).forEach((oid) => oid && veliIdSet.add(oid));
        });

        const kullaniciResults = await Promise.all(
          Array.from(veliIdSet).map((id) => get(ref(database, `kullanicilar/${id}`)).then((s) => (s.exists() ? [id, s.val()] : null)))
        );
        const kullanicilarMap = Object.fromEntries(kullaniciResults.filter(Boolean));

        const liste = cocuklarArr
          .map((c) => {
            const sinif = c.sinifId ? siniflarMap[c.sinifId] : null;
            const birthDate = getChildBirthDate(c);

            const veliBilgileri = asArray(c.veliIds)
              .filter((vid) => kullanicilarMap[vid])
              .map((vid) => {
                const v = kullanicilarMap[vid];
                return { ad: `${v.ad || ''} ${v.soyad || ''}`.trim() || v.kullaniciAdi || vid, telefon: v.telefon || null };
              });

            let ogretmenAd = null;
            const ogretmenIds = sinif ? asArray(sinif.ogretmenIds) : [];
            if (ogretmenIds.length > 0) {
              const og = kullanicilarMap[ogretmenIds[0]];
              if (og) ogretmenAd = `${og.ad || ''} ${og.soyad || ''}`.trim() || og.kullaniciAdi || null;
            }

            return {
              id: c.id,
              ad: `${c.ad || ''} ${c.soyad || ''}`.trim() || c.ad || c.id,
              dogumTarihi: birthDate,
              yas: calculateChildAge(birthDate),
              sinifId: c.sinifId || null,
              sinifAd: sinif ? sinif.ad : c.sinifId || null,
              veliler: veliBilgileri,
              ogretmenAd,
              veliIds: c.veliIds || [],
              adres: c.adres || '',
              yeniBaslayan: c.yeniBaslayan === true || c.uyumTakibiAktif === true || c.uyumDurumu === 'aktif',
              uyumDurumu: c.uyumDurumu || (c.uyumTakibiAktif ? 'aktif' : 'pasif'),
              uyumBaslangicTarihi: c.uyumBaslangicTarihi || '',
              durum: c.durum === 'ayrildi' ? 'ayrildi' : 'aktif',
              ayrilmaTarihi: c.ayrilmaTarihi || '',
              createdAt: c.createdAt || null,
            };
          })
          .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

        setChildren(liste);
        setLoading(false);
      } catch (error) {
        console.warn('Çocuk listesi çekme hatası:', error);
        setChildren([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [kresId]);

  // ── Form için sınıf + veli listesi (mobildeki ChildFormScreen.js) ─
  useEffect(() => {
    if (!kresId) {
      setSiniflar([]);
      setVeliler([]);
      return;
    }

    const sinifUnsub = onValue(ref(database, `kresSiniflari/${kresId}`), async (snap) => {
      if (!snap.exists()) {
        setSiniflar([]);
        return;
      }
      const ids = Object.keys(snap.val());
      const results = await Promise.all(ids.map((id) => get(ref(database, `siniflar/${id}`)).then((s) => (s.exists() ? { id, ...s.val() } : null))));
      setSiniflar(results.filter(Boolean));
    });

    const veliUnsub = onValue(ref(database, `kresKullanicilari/${kresId}/veliler`), async (snap) => {
      if (!snap.exists()) {
        setVeliler([]);
        return;
      }
      const ids = Object.keys(snap.val());
      const results = await Promise.all(ids.map((id) => get(ref(database, `kullanicilar/${id}`)).then((s) => (s.exists() ? { id, ...s.val() } : null))));
      setVeliler(results.filter(Boolean));
    });

    return () => {
      sinifUnsub();
      veliUnsub();
    };
  }, [kresId]);

  // Abonelik öğrenci limiti — mobildeki ChildFormScreen.js'teki aynı kontrol.
  useEffect(() => {
    if (!kresId) { setOgrenciLimiti(null); return; }
    const unsub = onValue(ref(database, `abonelikler/${kresId}`), (snap) => {
      const abonelik = snap.val();
      setOgrenciLimiti(abonelik?.ogrenciLimiti ? Number(abonelik.ogrenciLimiti) : null);
    }, () => setOgrenciLimiti(null));
    return () => unsub();
  }, [kresId]);

  const aktifCocuklar = children.filter((c) => c.durum !== 'ayrildi');
  const limitDoldu = ogrenciLimiti != null && aktifCocuklar.length >= ogrenciLimiti;

  const gorunenCocuklar = children.filter((c) => {
    if (durumFilter === 'tumu') { /* devam */ }
    else if (durumFilter === 'ayrildi' && c.durum !== 'ayrildi') return false;
    else if (durumFilter !== 'ayrildi' && c.durum === 'ayrildi') return false;

    if (!aramaMetni.trim()) return true;
    const q = aramaMetni.trim().toLocaleLowerCase('tr');
    const veliAdlari = (c.veliler || []).map((v) => v.ad || '').join(' ');
    return `${c.ad || ''} ${c.sinifAd || ''} ${c.ogretmenAd || ''} ${veliAdlari}`.toLocaleLowerCase('tr').includes(q);
  });

  const openCreate = () => {
    if (limitDoldu) {
      message.error(`Öğrenci limitiniz doldu (${aktifCocuklar.length}/${ogrenciLimiti}). Yeni öğrenci eklemek için abonelik / paket yükseltme talebi göndermeniz gerekiyor.`);
      return;
    }
    setEditingId(null);
    form.resetFields();
    setYeniBaslayan(false);
    setUyumDurumu('pasif');
    setDurum('aktif');
    setDrawerOpen(true);
  };

  const openEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({
      ad: record.ad,
      dogumTarihi: formatChildBirthDate(record.dogumTarihi) === 'Belirtilmemiş' ? '' : formatChildBirthDate(record.dogumTarihi),
      sinifId: record.sinifId,
      adres: record.adres,
      veliIds: record.veliIds,
      uyumBaslangicTarihi: record.uyumBaslangicTarihi || bugunKey(),
      ayrilmaTarihi: record.ayrilmaTarihi || bugunKey(),
    });
    setYeniBaslayan(record.yeniBaslayan);
    setUyumDurumu(record.uyumDurumu);
    setDurum(record.durum || 'aktif');
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    const normalizedBirthDate = normalizeChildBirthDate(values.dogumTarihi);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthDate)) {
      message.error('Doğum tarihini 15.05.2022 veya 2022-05-15 formatında gir.');
      return;
    }
    const uyumBaslangicTarihi = values.uyumBaslangicTarihi || bugunKey();
    if (yeniBaslayan && !/^\d{4}-\d{2}-\d{2}$/.test(uyumBaslangicTarihi)) {
      message.error('Uyum başlangıç tarihini 2026-06-26 formatında gir.');
      return;
    }
    const ayrilmaTarihi = values.ayrilmaTarihi || bugunKey();
    if (durum === 'ayrildi' && !/^\d{4}-\d{2}-\d{2}$/.test(ayrilmaTarihi)) {
      message.error('Ayrılma tarihini 2026-06-26 formatında gir.');
      return;
    }

    // Yeni çocuk eklerken abonelik öğrenci limiti aşılıyorsa engelle
    // (openCreate'de de kontrol var, burada aynı kontrol race-condition'a karşı ikinci güvence).
    if (!editingId && limitDoldu) {
      message.error(`Öğrenci limitiniz doldu (${aktifCocuklar.length}/${ogrenciLimiti}). Yeni öğrenci eklemek için abonelik / paket yükseltme talebi göndermeniz gerekiyor.`);
      return;
    }

    setSaving(true);
    try {
      const id = editingId || generateId();
      const existingSnap = editingId ? await get(ref(database, `cocuklar/${editingId}`)) : null;
      const existing = existingSnap?.exists?.() ? existingSnap.val() : {};
      const uyumAktif = yeniBaslayan && uyumDurumu !== 'tamamlandi';
      const seciliVeliIds = values.veliIds || [];
      const finalKresId = kresId || existing?.kresId || 'default-kres';

      const childPayload = {
        ...existing,
        ad: values.ad.trim(),
        dogumTarihi: normalizedBirthDate,
        sinifId: values.sinifId,
        kresId: finalKresId,
        adres: (values.adres || '').trim(),
        adresKonum: (values.adres || '').trim() !== (existing?.adres || '') ? null : existing?.adresKonum || null,
        veliIds: seciliVeliIds,
        yeniBaslayan,
        uyumTakibiAktif: uyumAktif,
        uyumBaslangicTarihi: yeniBaslayan ? uyumBaslangicTarihi : existing?.uyumBaslangicTarihi || '',
        uyumSureGun: 30,
        uyumDurumu: yeniBaslayan ? (uyumDurumu === 'tamamlandi' ? 'tamamlandi' : 'aktif') : 'pasif',
        durum,
        ayrilmaTarihi: durum === 'ayrildi' ? ayrilmaTarihi : '',
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      const updates = {
        [`cocuklar/${id}`]: childPayload,
        [`kresCocuklari/${finalKresId}/${id}`]: true,
        [`sinifCocuklari/${values.sinifId}/${id}`]: true,
      };

      if (existing?.kresId && existing.kresId !== finalKresId) updates[`kresCocuklari/${existing.kresId}/${id}`] = null;
      if (existing?.sinifId && existing.sinifId !== values.sinifId) updates[`sinifCocuklari/${existing.sinifId}/${id}`] = null;

      const oldParents = [...asArray(existing?.veliIds), existing?.veliId, existing?.parentId].filter(Boolean);
      oldParents.forEach((veliId) => {
        if (!seciliVeliIds.includes(veliId)) updates[`veliCocuklari/${veliId}/${id}`] = null;
      });
      seciliVeliIds.forEach((veliId) => {
        if (veliId) updates[`veliCocuklari/${veliId}/${id}`] = true;
      });

      await update(ref(database), updates);
      message.success(editingId ? 'Çocuk bilgileri güncellendi' : 'Çocuk kaydedildi');
      setDrawerOpen(false);

      denetimKaydiYaz({
        kresId: finalKresId,
        kullanici,
        islem: editingId ? 'guncelle' : 'ekle',
        modul: 'Çocuklar',
        hedef: childPayload.ad,
        detay: durum === 'ayrildi' ? 'Durum: Ayrıldı olarak işaretlendi' : '',
      });
    } catch (error) {
      console.error(error);
      message.error('Çocuk kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: 'Ad Soyad', dataIndex: 'ad', key: 'ad' },
    { title: 'Sınıf', dataIndex: 'sinifAd', key: 'sinifAd', render: (v) => v || <Text type="secondary">Belirtilmemiş</Text> },
    { title: 'Yaş', dataIndex: 'yas', key: 'yas' },
    { title: 'Öğretmen', dataIndex: 'ogretmenAd', key: 'ogretmenAd', render: (v) => v || <Text type="secondary">Atanmamış</Text> },
    {
      title: 'Veli',
      key: 'veli',
      render: (_, r) => (r.veliler.length ? r.veliler.map((v) => v.ad).join(', ') : <Text type="secondary">Bağlı değil</Text>),
    },
    {
      title: 'Uyum',
      key: 'uyum',
      render: (_, r) => (r.yeniBaslayan ? <Tag color={r.uyumDurumu === 'tamamlandi' ? 'purple' : 'green'}>{r.uyumDurumu === 'tamamlandi' ? 'Tamamlandı' : 'Aktif'}</Tag> : null),
    },
    {
      title: 'Durum',
      key: 'durum',
      render: (_, r) => (r.durum === 'ayrildi'
        ? <Tag color="red">Ayrıldı{r.ayrilmaTarihi ? ` · ${formatChildBirthDate(r.ayrilmaTarihi)}` : ''}</Tag>
        : <Tag color="green">Aktif</Tag>),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Çocuklar</Title>
          <Text type="secondary">{aktifCocuklar.length} aktif çocuk{children.length !== aktifCocuklar.length ? ` · ${children.length - aktifCocuklar.length} ayrıldı` : ''}</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Çocuk Ekle</Button>
      </div>

      {limitDoldu && (
        <div style={{ background: '#FFE8EE', border: '1px solid #FFC2D1', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#B3123A', fontWeight: 600, fontSize: 13 }}>
          ⚠️ Öğrenci limitiniz doldu ({aktifCocuklar.length}/{ogrenciLimiti}). Yeni öğrenci eklemek için abonelik / paket yükseltme talebi göndermeniz gerekiyor.
        </div>
      )}

      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented
          value={durumFilter}
          onChange={setDurumFilter}
          options={[
            { label: 'Aktif', value: 'aktif' },
            { label: 'Ayrılan', value: 'ayrildi' },
            { label: 'Tümü', value: 'tumu' },
          ]}
        />
        <Input.Search
          placeholder="Çocuk, sınıf, öğretmen veya veli adına göre ara"
          allowClear
          style={{ width: 280 }}
          value={aramaMetni}
          onChange={(e) => setAramaMetni(e.target.value)}
        />
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={gorunenCocuklar}
        onRow={(record) => ({ onClick: () => openEdit(record), style: { cursor: 'pointer' } })}
        locale={{ emptyText: <Empty description="Henüz çocuk eklenmemiş" /> }}
        pagination={{ pageSize: 10 }}
      />

      <Drawer
        title={editingId ? 'Çocuğu Düzenle' : 'Yeni Çocuk'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={460}
        extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? 'Güncelle' : 'Oluştur'}</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="ad" label="Çocuk Adı" rules={[{ required: true, message: 'Ad soyad zorunlu' }]}>
            <Input placeholder="Örn: Ali Yılmaz" />
          </Form.Item>
          <Form.Item
            name="dogumTarihi"
            label="Doğum Tarihi"
            rules={[{ required: true, message: 'Doğum tarihi zorunlu' }]}
            extra="Kaydedilince sistem 2022-05-15 olarak saklar, ekranlarda 15.05.2022 gösterir."
          >
            <Input placeholder="15.05.2022" />
          </Form.Item>
          <Form.Item name="sinifId" label="Sınıf" rules={[{ required: true, message: 'Sınıf seçimi zorunlu' }]}>
            <Select
              placeholder={siniflar.length === 0 ? 'Önce sınıf oluşturun' : 'Sınıf seçin'}
              disabled={siniflar.length === 0}
              options={siniflar.map((s) => ({ value: s.id, label: `${s.ad} — ${s.yasGrubu}` }))}
            />
          </Form.Item>

          <div style={{ background: '#F4FBF5', border: '1px solid #DDEFE3', borderRadius: 14, padding: 14, marginBottom: 20 }}>
            <Text strong>🌱 Uyum Modülü</Text>
            <div style={{ color: THEME.muted, fontWeight: 600, fontSize: 13, marginTop: 4, marginBottom: 10 }}>
              Bu çocuk kreşe yeni başlayan öğrenci mi? Seçilirse 30 günlük uyum takibi öğretmen ve veli tarafında açılır.
            </div>
            <Radio.Group
              value={yeniBaslayan}
              onChange={(e) => {
                setYeniBaslayan(e.target.value);
                setUyumDurumu(e.target.value ? 'aktif' : 'pasif');
              }}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value={false}>Mevcut öğrenci</Radio.Button>
              <Radio.Button value>Yeni başlayan</Radio.Button>
            </Radio.Group>

            {yeniBaslayan && (
              <div style={{ marginTop: 12 }}>
                <Form.Item name="uyumBaslangicTarihi" label="Uyum başlangıç tarihi" extra="30 gün sonunda aktif takip kapanır, kayıtlar veli geçmişinde kalır." style={{ marginBottom: 10 }}>
                  <Input placeholder="2026-06-26" />
                </Form.Item>
                {editingId && (
                  <Radio.Group value={uyumDurumu} onChange={(e) => setUyumDurumu(e.target.value)} optionType="button" buttonStyle="solid">
                    <Radio.Button value="aktif">Aktif</Radio.Button>
                    <Radio.Button value="tamamlandi">Tamamlandı</Radio.Button>
                  </Radio.Group>
                )}
              </div>
            )}
          </div>

          <Form.Item name="adres" label="Servis / Ev Adresi" extra="Servis kullanıyorsa buraya girilen adres, servisçinin rota ekranında konum/yol tarifi için kullanılır.">
            <Input.TextArea rows={3} placeholder="Örn: Muğla Mah. Deniz Sok. No:5 Bodrum" />
          </Form.Item>

          <Form.Item name="veliIds" label="Veli Bağla (opsiyonel)">
            <Select
              mode="multiple"
              placeholder={veliler.length === 0 ? 'Henüz veli yok' : 'Veli seçin'}
              disabled={veliler.length === 0}
              options={veliler.map((v) => ({ value: v.id, label: `${v.ad || ''} (${v.kullaniciAdi || '-'})` }))}
            />
          </Form.Item>

          {editingId && (
            <div style={{ background: '#FFF5F5', border: '1px solid #FFDCE0', borderRadius: 14, padding: 14 }}>
              <Text strong>🚪 Kayıt Durumu</Text>
              <div style={{ color: THEME.muted, fontWeight: 600, fontSize: 13, marginTop: 4, marginBottom: 10 }}>
                Çocuk kreşten ayrıldıysa kaydı silme — geçmiş yoklama/rapor verileri kalsın diye burada "Ayrıldı" olarak işaretle.
              </div>
              <Radio.Group value={durum} onChange={(e) => setDurum(e.target.value)} optionType="button" buttonStyle="solid">
                <Radio.Button value="aktif">Aktif</Radio.Button>
                <Radio.Button value="ayrildi">Ayrıldı</Radio.Button>
              </Radio.Group>

              {durum === 'ayrildi' && (
                <Form.Item name="ayrilmaTarihi" label="Ayrılma tarihi" style={{ marginTop: 12, marginBottom: 0 }}>
                  <Input placeholder="2026-06-26" />
                </Form.Item>
              )}
            </div>
          )}
        </Form>
      </Drawer>
    </div>
  );
}
