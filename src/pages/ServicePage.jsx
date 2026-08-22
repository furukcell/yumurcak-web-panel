import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Tabs, Table, Button, Drawer, Form, Input, Switch, Tag, message, Empty, Space, Popconfirm, Spin } from 'antd';
import { PlusOutlined, LeftOutlined, RightOutlined, EyeInvisibleOutlined, EyeTwoTone, PrinterOutlined } from '@ant-design/icons';
import { ref, onValue, get, update, remove, query, orderByChild, equalTo } from 'firebase/database';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { generateId } from '../utils/crudHelpers';
import { usernameToEmail, normalizeUsername } from '../utils/authHelpers';
import { getSecondaryAuth } from '../utils/secondaryAuth';
import { fetchInstitutionInfo, buildServiceListHtml, printHtmlDocument } from '../services/documentPdf';

const { Title, Text } = Typography;

function pad2(v) { return String(v).padStart(2, '0'); }
function toDateKey(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }
function formatTime(zaman) {
  if (!zaman) return null;
  const d = new Date(zaman);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Mobildeki AdminVehicleListScreen/FormScreen + AdminServiceScreen +
// AdminServiceStatsScreen'in web karşılığı — 3 sekmede birleştirildi.
export default function ServicePage() {
  const items = [
    { key: 'araclar', label: 'Araçlar', children: <VehiclesTab /> },
    { key: 'atamalar', label: 'Çocuk Atamaları', children: <AssignmentsTab /> },
    { key: 'takip', label: 'Günlük Takip', children: <DailyTrackingTab /> },
  ];
  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>Servis</Title>
      <Text type="secondary">Servis araçları, çocuk atamaları ve günlük takip</Text>
      <Tabs items={items} style={{ marginTop: 16 }} />
    </div>
  );
}

function VehiclesTab() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId;

  const [vehicles, setVehicles] = useState([]);
  const [servisciMap, setServisciMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!kresId) { setLoading(false); return; }
    const q = query(ref(database, 'servisler'), orderByChild('kresId'), equalTo(kresId));
    const unsub = onValue(q, async (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id, v]) => ({ id, ...v }));
      const servisciIds = Array.from(new Set(list.map((v) => v.servisciId).filter(Boolean)));
      const results = await Promise.all(servisciIds.map((id) => get(ref(database, `kullanicilar/${id}`)).then((s) => (s.exists() ? [id, s.val()] : null))));
      setServisciMap(Object.fromEntries(results.filter(Boolean)));
      list.sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'));
      setVehicles(list);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [kresId]);

  const openCreate = () => { setEditingId(null); form.resetFields(); setDrawerOpen(true); };
  const openEdit = async (vehicle) => {
    setEditingId(vehicle.id);
    const servisci = servisciMap[vehicle.servisciId];
    form.setFieldsValue({ ad: vehicle.ad, plaka: vehicle.plaka, kullaniciAdi: servisci?.kullaniciAdi, servisciAd: servisci?.ad, sifre: '' });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    let values;
    try { values = await form.validateFields(); } catch { return; }

    setSaving(true);
    try {
      const id = editingId || generateId();
      const vehicleSnap = editingId ? await get(ref(database, `servisler/${id}`)) : null;
      const oldVehicle = vehicleSnap?.exists?.() ? vehicleSnap.val() : null;
      const oldServisciId = oldVehicle?.servisciId || null;
      const oldServisciSnap = oldServisciId ? await get(ref(database, `kullanicilar/${oldServisciId}`)) : null;
      const oldServisci = oldServisciSnap?.exists?.() ? oldServisciSnap.val() : null;

      if (editingId && oldServisci?.authUid && (values.sifre || '').trim()) {
        message.error('Bu görevli Firebase Auth hesabına bağlı. Şifresi bu ekrandan değiştirilemez.');
        setSaving(false);
        return;
      }

      const servisciId = oldServisciId || generateId();
      const now = Date.now();
      const kaydedilenSifre = (values.sifre || '').trim() || oldServisci?.sifre || '123456';
      if (kaydedilenSifre.length < 6) { message.error('Şifre en az 6 karakter olmalı'); setSaving(false); return; }

      const email = oldServisci?.email || usernameToEmail(values.kullaniciAdi.trim());
      let authUid = oldServisci?.authUid || null;
      if (!authUid) {
        const secondaryAuth = getSecondaryAuth('yumurcak-servisci-create');
        const credential = await createUserWithEmailAndPassword(secondaryAuth, email, kaydedilenSifre);
        authUid = credential.user.uid;
        await signOut(secondaryAuth).catch(() => {});
      }

      const kresIdFinal = oldVehicle?.kresId || kresId || 'default-kres';
      const nextUsername = values.kullaniciAdi.trim();
      const cleanNewUsername = normalizeUsername(nextUsername);
      const cleanOldUsername = oldServisci?.kullaniciAdi ? normalizeUsername(oldServisci.kullaniciAdi) : null;

      const updates = {};
      updates[`kullanicilar/${servisciId}`] = { ...oldServisci, kullaniciAdi: nextUsername, sifre: kaydedilenSifre, ad: values.servisciAd.trim(), rol: 'servisci', kresId: kresIdFinal, authUid, email, authProvider: 'firebase', authCreatedAt: oldServisci?.authCreatedAt || now, authUpdatedAt: now, createdAt: oldServisci?.createdAt || now, updatedAt: now };
      updates[`authKullaniciIndex/${authUid}`] = servisciId;
      updates[`kresKullanicilari/${kresIdFinal}/servisciler/${servisciId}`] = true;
      updates[`kullaniciKresleri/${servisciId}/${kresIdFinal}`] = true;
      if (cleanNewUsername) updates[`kullaniciAdiIndex/${cleanNewUsername}`] = servisciId;
      if (cleanOldUsername && cleanOldUsername !== cleanNewUsername) updates[`kullaniciAdiIndex/${cleanOldUsername}`] = null;
      updates[`servisler/${id}`] = { ...oldVehicle, plaka: values.plaka.trim(), ad: values.ad.trim(), servisciId, kresId: kresIdFinal, createdAt: oldVehicle?.createdAt || now, updatedAt: now };

      await update(ref(database), updates);
      message.success(editingId ? 'Servis aracı güncellendi' : 'Servis aracı oluşturuldu');
      setDrawerOpen(false);
    } catch (error) {
      if (error?.code === 'auth/email-already-in-use') message.error('Bu kullanıcı adı için Firebase Auth hesabı zaten var.');
      else message.error('Servis aracı kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vehicle) => {
    try {
      await remove(ref(database, `servisler/${vehicle.id}`));
      message.success('Araç silindi');
      setDrawerOpen(false);
    } catch {
      message.error('Araç silinemedi.');
    }
  };

  const columns = [
    { title: 'Servis Adı', dataIndex: 'ad', key: 'ad', render: (v) => v || 'İsimsiz Servis' },
    { title: 'Plaka', dataIndex: 'plaka', key: 'plaka', render: (v) => v || <Text type="secondary">Girilmemiş</Text> },
    { title: 'Görevli', key: 'servisci', render: (_, r) => { const s = servisciMap[r.servisciId]; return s ? `👤 ${s.ad || s.kullaniciAdi}` : <Text type="danger">⚠️ Hesap bulunamadı</Text>; } },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Yeni Servis Aracı</Button>
      </div>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={vehicles} onRow={(r) => ({ onClick: () => openEdit(r), style: { cursor: 'pointer' } })} locale={{ emptyText: <Empty description="Henüz servis aracı eklenmedi" /> }} pagination={{ pageSize: 10 }} />

      <Drawer title={editingId ? 'Servis Aracını Düzenle' : 'Yeni Servis Aracı'} open={drawerOpen} onClose={() => setDrawerOpen(false)} width={420} extra={<Button type="primary" loading={saving} onClick={handleSave}>{editingId ? 'Güncelle' : 'Oluştur'}</Button>}>
        <Form form={form} layout="vertical">
          <Text strong>Araç Bilgileri</Text>
          <Form.Item name="ad" label="Servis Adı" rules={[{ required: true, message: 'Zorunlu' }]} style={{ marginTop: 10 }}>
            <Input placeholder="Örn: 1 Nolu Servis / Sabah Turu" />
          </Form.Item>
          <Form.Item name="plaka" label="Plaka" rules={[{ required: true, message: 'Zorunlu' }]}>
            <Input placeholder="Örn: 48 AB 123" />
          </Form.Item>

          <Text strong>Servis Görevlisi</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4, marginBottom: 10 }}>Bu araca atanan görevli, kendi hesabıyla giriş yapıp çocukları alındı/bırakıldı işaretleyebilir.</Text>
          <Form.Item name="kullaniciAdi" label="Kullanıcı Adı" rules={[{ required: true, message: 'Zorunlu' }]}>
            <Input placeholder="Örn: servis1" />
          </Form.Item>
          <Form.Item name="servisciAd" label="Ad Soyad" rules={[{ required: true, message: 'Zorunlu' }]}>
            <Input placeholder="Örn: Ayşe Yılmaz" />
          </Form.Item>
          <Form.Item name="sifre" label="Şifre" extra={editingId ? 'Boş bırakılırsa mevcut şifre korunur.' : 'Boş bırakılırsa varsayılan şifre 123456 olur.'}>
            <Input.Password iconRender={(v) => (v ? <EyeTwoTone /> : <EyeInvisibleOutlined />)} />
          </Form.Item>
        </Form>

        {editingId && (
          <Popconfirm title="Bu servis aracı silinsin mi?" okText="Sil" cancelText="Vazgeç" okButtonProps={{ danger: true }} onConfirm={() => handleDelete({ id: editingId })}>
            <Button danger block>Servis Aracını Sil</Button>
          </Popconfirm>
        )}
      </Drawer>
    </div>
  );
}

function AssignmentsTab() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId;

  const [children, setChildren] = useState([]);
  const [sinifMap, setSinifMap] = useState({});
  const [serviceMap, setServiceMap] = useState({});
  const [vehicles, setVehicles] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!kresId) { setLoading(false); return; }
    const unsub = onValue(ref(database, `kresCocuklari/${kresId}`), async (snap) => {
      const idsData = snap.val();
      if (!idsData) { setChildren([]); setLoading(false); return; }
      const ids = Object.keys(idsData);
      const results = await Promise.all(ids.map((id) => get(ref(database, `cocuklar/${id}`)).then((s) => (s.exists() ? { id, ...s.val() } : null))));
      setChildren(results.filter(Boolean));
      setLoading(false);
    }, () => setLoading(false));

    const sinifUnsub = onValue(query(ref(database, 'siniflar'), orderByChild('kresId'), equalTo(kresId)), (snap) => {
      const data = snap.val() || {};
      const map = {};
      Object.entries(data).forEach(([id, v]) => { map[id] = v?.ad || ''; });
      setSinifMap(map);
    });

    const serviceUnsub = onValue(ref(database, 'servisBilgileri'), (snap) => setServiceMap(snap.val() || {}));
    const vehiclesUnsub = onValue(query(ref(database, 'servisler'), orderByChild('kresId'), equalTo(kresId)), (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id, v]) => ({ id, ...v }));
      list.sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'));
      setVehicles(list);
    });

    return () => { unsub(); sinifUnsub(); serviceUnsub(); vehiclesUnsub(); };
  }, [kresId]);

  useEffect(() => {
    const next = {};
    children.forEach((child) => {
      const info = serviceMap[child.id] || {};
      next[child.id] = { servisKullaniyor: info.servisKullaniyor || false, servisId: info.servisId || '', alisSaati: info.alisSaati || '', birakisSaati: info.birakisSaati || '', servisNotu: info.servisNotu || '' };
    });
    setDrafts(next);
  }, [children, serviceMap]);

  function updateDraft(childId, field, value) {
    setDrafts((prev) => ({ ...prev, [childId]: { ...(prev[childId] || {}), [field]: value } }));
  }

  async function saveChild(childId) {
    const draft = drafts[childId];
    if (!draft) return;
    setSavingId(childId);
    try {
      await update(ref(database, `servisBilgileri/${childId}`), { kresId, servisKullaniyor: !!draft.servisKullaniyor, servisId: draft.servisId || '', alisSaati: draft.alisSaati.trim(), birakisSaati: draft.birakisSaati.trim(), servisNotu: draft.servisNotu.trim(), updatedAt: Date.now() });
      message.success('Servis bilgisi kaydedildi');
    } catch {
      message.error('Servis bilgisi kaydedilemedi.');
    } finally {
      setSavingId(null);
    }
  }

  const serviceChildCount = useMemo(() => children.filter((c) => drafts[c.id]?.servisKullaniyor).length, [children, drafts]);

  async function doPrint() {
    const serviceChildren = children.filter((c) => drafts[c.id]?.servisKullaniyor);
    if (serviceChildren.length === 0) { message.warning('Servis kullanan çocuk kaydı yok.'); return; }
    setPrinting(true);
    try {
      const kres = await fetchInstitutionInfo(kresId);
      const records = serviceChildren.map((child) => {
        const draft = drafts[child.id];
        const vehicle = vehicles.find((v) => v.id === draft.servisId);
        return {
          ad: `${child.ad || ''} ${child.soyad || ''}`.trim(),
          sinifAd: sinifMap[child.sinifId] || '',
          servisAd: vehicle ? (vehicle.ad || vehicle.plaka || '') : '',
          alisSaati: draft.alisSaati || '',
          birakisSaati: draft.birakisSaati || '',
          servisNotu: draft.servisNotu || '',
        };
      });
      const html = buildServiceListHtml({ kres, records });
      printHtmlDocument(html);
    } catch {
      message.error('Servis listesi oluşturulamadı.');
    } finally {
      setPrinting(false);
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text type="secondary">{serviceChildCount} çocuk servis kullanıyor</Text>
        <Button icon={<PrinterOutlined />} loading={printing} onClick={doPrint}>Yazdır / PDF</Button>
      </div>
      {children.length === 0 ? <Empty description="Kayıtlı çocuk yok" /> : children.map((child) => {
        const draft = drafts[child.id] || { servisKullaniyor: false, servisId: '', alisSaati: '', birakisSaati: '', servisNotu: '' };
        return (
          <div key={child.id} style={{ border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <Text strong>{child.ad} {child.soyad}</Text>
                <div><Text type="secondary" style={{ fontSize: 12 }}>{sinifMap[child.sinifId] || 'Sınıf yok'}</Text></div>
              </div>
              <Switch checked={!!draft.servisKullaniyor} onChange={(v) => updateDraft(child.id, 'servisKullaniyor', v)} />
            </div>

            {draft.servisKullaniyor && (
              <>
                {vehicles.length === 0 ? (
                  <Text type="secondary">⚠️ Henüz servis aracı eklenmedi. Önce "Araçlar" sekmesinden ekle.</Text>
                ) : (
                  <Space wrap style={{ marginBottom: 8 }}>
                    {vehicles.map((v) => (
                      <Tag.CheckableTag key={v.id} checked={draft.servisId === v.id} onChange={() => updateDraft(child.id, 'servisId', draft.servisId === v.id ? '' : v.id)}>
                        {v.ad || v.plaka}
                      </Tag.CheckableTag>
                    ))}
                  </Space>
                )}
                <Space style={{ width: '100%', marginBottom: 8 }}>
                  <Input value={draft.alisSaati} onChange={(e) => updateDraft(child.id, 'alisSaati', e.target.value)} placeholder="Alış saati (08:00)" style={{ width: 160 }} />
                  <Input value={draft.birakisSaati} onChange={(e) => updateDraft(child.id, 'birakisSaati', e.target.value)} placeholder="Bırakış saati (16:30)" style={{ width: 160 }} />
                </Space>
                <Input value={draft.servisNotu} onChange={(e) => updateDraft(child.id, 'servisNotu', e.target.value)} placeholder="Not" style={{ marginBottom: 8 }} />
              </>
            )}

            <Button size="small" type="primary" loading={savingId === child.id} onClick={() => saveChild(child.id)}>Kaydet</Button>
          </div>
        );
      })}
    </div>
  );
}

function DailyTrackingTab() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId;

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState([]);
  const [serviceMap, setServiceMap] = useState({});
  const [gunlukDurum, setGunlukDurum] = useState({});
  const [childrenMap, setChildrenMap] = useState({});

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const isToday = dateKey === todayKey;

  useEffect(() => {
    if (!kresId) return;
    const q = query(ref(database, 'servisler'), orderByChild('kresId'), equalTo(kresId));
    const unsub = onValue(q, (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id, v]) => ({ id, ...v }));
      list.sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'));
      setVehicles(list);
    });
    return () => unsub();
  }, [kresId]);

  useEffect(() => {
    const unsub = onValue(ref(database, 'servisBilgileri'), (snap) => setServiceMap(snap.val() || {}));
    return () => unsub();
  }, []);

  useEffect(() => {
    setLoading(true);
    const unsub = onValue(ref(database, `servisGunlukDurum/${dateKey}`), async (snap) => {
      const data = snap.val() || {};
      setGunlukDurum(data);
      const idsFromDurum = Object.values(data).flatMap((v) => Object.keys(v?.cocuklar || {}));
      const idsFromAtama = Object.entries(serviceMap).filter(([, v]) => v?.servisKullaniyor).map(([id]) => id);
      const allIds = [...new Set([...idsFromDurum, ...idsFromAtama])];
      const missing = allIds.filter((id) => !childrenMap[id]);
      if (missing.length > 0) {
        const results = await Promise.all(missing.map((id) => get(ref(database, `cocuklar/${id}`)).then((s) => (s.exists() ? [id, s.val()] : null))));
        setChildrenMap((prev) => ({ ...prev, ...Object.fromEntries(results.filter(Boolean)) }));
      }
      setLoading(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, () => setLoading(false));
    return () => unsub();
  }, [dateKey, serviceMap]);

  const assignedChildren = useMemo(() => Object.entries(serviceMap).filter(([, v]) => v?.servisKullaniyor).map(([id, v]) => ({ id, ...v })), [serviceMap]);
  const alinmayanlar = useMemo(() => {
    if (!isToday) return [];
    return assignedChildren.filter((c) => { const vehicleDurum = gunlukDurum[c.servisId]?.cocuklar || {}; return !vehicleDurum[c.id]?.alindi; });
  }, [assignedChildren, gunlukDurum, isToday]);

  function shiftDay(delta) {
    setSelectedDate((prev) => { const next = new Date(prev); next.setDate(next.getDate() + delta); return next; });
  }

  const formatDateLabel = () => {
    if (isToday) return 'Bugün';
    const dun = new Date(); dun.setDate(dun.getDate() - 1);
    if (dateKey === toDateKey(dun)) return 'Dün';
    return selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Button icon={<LeftOutlined />} shape="circle" onClick={() => shiftDay(-1)} />
        <div style={{ textAlign: 'center' }}>
          <Text strong style={{ fontSize: 16 }}>{formatDateLabel()}</Text>
          {!isToday && <div><a onClick={() => setSelectedDate(new Date())}>Bugüne dön</a></div>}
        </div>
        <Button icon={<RightOutlined />} shape="circle" disabled={isToday} onClick={() => !isToday && shiftDay(1)} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : (
        <>
          {isToday && alinmayanlar.length > 0 && (
            <div style={{ background: '#FFF1F3', border: `1px solid ${THEME.red}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
              <Text strong style={{ color: THEME.red }}>⏳ Henüz Alınmayanlar ({alinmayanlar.length})</Text>
              {alinmayanlar.map((c) => {
                const child = childrenMap[c.id];
                const vehicle = vehicles.find((v) => v.id === c.servisId);
                return <div key={c.id}><Text style={{ fontSize: 13 }}>• {child ? `${child.ad} ${child.soyad}` : '...'} {vehicle ? `(${vehicle.ad || vehicle.plaka})` : ''}</Text></div>;
              })}
            </div>
          )}

          {vehicles.length === 0 ? (
            <Empty description="Henüz servis aracı eklenmedi" />
          ) : (
            vehicles.map((vehicle) => {
              const durum = gunlukDurum[vehicle.id] || {};
              const cocuklar = assignedChildren.filter((c) => c.servisId === vehicle.id);
              const varmaSaat = formatTime(durum.kurumaVardi?.zaman);
              return (
                <div key={vehicle.id} style={{ border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text strong>{vehicle.ad || vehicle.plaka}</Text>
                    <Tag color={varmaSaat ? 'green' : 'orange'}>{varmaSaat ? `✅ Vardı ${varmaSaat}` : '⏳ Henüz varmadı'}</Tag>
                  </div>
                  {cocuklar.length === 0 ? (
                    <Text type="secondary">Bu araca atanmış çocuk yok.</Text>
                  ) : (
                    cocuklar.map((c) => {
                      const child = childrenMap[c.id];
                      const childDurum = (durum.cocuklar || {})[c.id] || {};
                      const alindiSaat = formatTime(childDurum.alindi?.zaman);
                      const birakildiSaat = formatTime(childDurum.birakildi?.zaman);
                      return (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${THEME.border}` }}>
                          <Text>{child ? `${child.ad} ${child.soyad}` : '...'}</Text>
                          <Space>
                            <Text type={alindiSaat ? undefined : 'secondary'}>{alindiSaat ? `✅ ${alindiSaat}` : '⏳ —'}</Text>
                            <Text type={birakildiSaat ? undefined : 'secondary'}>{birakildiSaat ? `✅ ${birakildiSaat}` : '⏳ —'}</Text>
                          </Space>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
