import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Select, Space, Tabs, Typography, message } from 'antd';
import { get, onValue, ref, update } from 'firebase/database';
import { useAuth } from '../src/context/AuthContext';
import { database } from '../src/config/firebase';
import AdministratorsPage from '../src/pages/AdministratorsPage';
import TeachersPage from '../src/pages/TeachersPage';
import ParentsPage from '../src/pages/ParentsPage';
import ChildrenPage from '../src/pages/ChildrenPage';
import ClassesPage from '../src/pages/ClassesPage';
import ServicePage from '../src/pages/ServicePage';
import MealsPage from '../src/pages/MealsPage';
import SchedulePage from '../src/pages/SchedulePage';
import { getPlatformSnapshot } from './superadminService';
import { formatInstitutionLocation } from './locationData';

const { Title, Text } = Typography;

function SaglikTab() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId;
  const [children, setChildren] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({ alerjiler: '', hastaliklar: '', ilaclar: '', saglikNotlari: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!kresId) return undefined;
    const unsub = onValue(ref(database, `kresCocuklari/${kresId}`), async (snap) => {
      const ids = snap.exists() ? Object.keys(snap.val()) : [];
      const rows = await Promise.all(ids.map(async (id) => {
        const s = await get(ref(database, `cocuklar/${id}`));
        return s.exists() ? { id, ...s.val() } : null;
      }));
      setChildren(rows.filter(Boolean).sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr')));
    });
    return () => unsub();
  }, [kresId]);

  useEffect(() => {
    if (!selectedId) {
      setForm({ alerjiler: '', hastaliklar: '', ilaclar: '', saglikNotlari: '' });
      return;
    }
    get(ref(database, `medikalBilgiler/${selectedId}`)).then((snap) => {
      const v = snap.val() || {};
      setForm({ alerjiler: v.alerjiler || '', hastaliklar: v.hastaliklar || '', ilaclar: v.ilaclar || '', saglikNotlari: v.saglikNotlari || v.notlar || '' });
    });
  }, [selectedId]);

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await update(ref(database, `medikalBilgiler/${selectedId}`), { ...form, cocukId: selectedId, kresId, updatedAt: Date.now() });
      message.success('Sağlık bilgileri kaydedildi.');
    } catch (e) { message.error(e?.message || 'Sağlık bilgileri kaydedilemedi.'); }
    finally { setSaving(false); }
  };

  if (!kresId) return <Empty description="Önce bir kurum seçin" />;
  return <Space direction="vertical" size={16} style={{ width:'100%' }}>
    <Card title="Öğrenci Sağlık / Medikal Bilgileri">
      <Select showSearch optionFilterProp="label" value={selectedId || undefined} onChange={setSelectedId} placeholder="Öğrenci seçin" style={{ width:'100%', maxWidth:620 }} options={children.map((c) => ({ value:c.id, label:c.ad || c.id }))} />
    </Card>
    {selectedId && <Card>
      <Space direction="vertical" size={12} style={{ width:'100%' }}>
        {[
          ['alerjiler','Alerjiler'],
          ['hastaliklar','Hastalıklar / Kronik Durumlar'],
          ['ilaclar','Düzenli İlaçlar'],
          ['saglikNotlari','Sağlık Notları'],
        ].map(([key,label]) => <div key={key}>
          <Text strong style={{ display:'block', marginBottom:6 }}>{label}</Text>
          <Input.TextArea rows={key === 'saglikNotlari' ? 5 : 3} value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />
        </div>)}
        <Button type="primary" loading={saving} onClick={save}>Sağlık Bilgilerini Kaydet</Button>
      </Space>
    </Card>}
  </Space>;
}

export default function SuperAdminKurumKurulum() {
  const { kres, setSuperAdminKres } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [kresId, setKresId] = useState(kres?.id || '');

  useEffect(() => {
    getPlatformSnapshot().then(setSnapshot).catch((e) => message.error(e?.message || 'Kurumlar alınamadı.'));
  }, []);
  useEffect(() => { if (kres?.id) setKresId(kres.id); }, [kres?.id]);

  const institutions = snapshot?.institutions || [];
  const selected = institutions.find((x) => x.id === kresId);
  const selectInstitution = (id) => { setKresId(id); setSuperAdminKres(id); };

  const tabs = [
    { key:'yoneticiler', label:'Yöneticiler', children:<AdministratorsPage /> },
    { key:'ogretmenler', label:'Öğretmenler', children:<TeachersPage /> },
    { key:'veliler', label:'Veliler', children:<ParentsPage /> },
    { key:'ogrenciler', label:'Öğrenciler', children:<ChildrenPage /> },
    { key:'siniflar', label:'Sınıflar', children:<ClassesPage /> },
    { key:'servis', label:'Servis', children:<ServicePage /> },
    { key:'yemek', label:'Yemek Listesi', children:<MealsPage /> },
    { key:'ders', label:'Ders Programı', children:<SchedulePage /> },
    { key:'saglik', label:'Sağlık / Alerji / Hastalık', children:<SaglikTab /> },
  ];

  return <div style={{ maxWidth:1600, margin:'0 auto' }}>
    <div style={{ marginBottom:18 }}>
      <Title level={2} style={{ margin:0 }}>Toplu Kurulum</Title>
      <Text type="secondary">Bir kreş seç. Yönetici panelindeki kişi, sınıf, öğrenci, servis, yemek ve ders programı işlemlerini bu kurum için yönet.</Text>
    </div>
    <Card title="Kurum Seçimi" style={{ marginBottom:18 }}>
      <Select showSearch optionFilterProp="label" value={kresId || undefined} onChange={selectInstitution} placeholder="Kurulum yapılacak kreşi seçin" style={{ width:'100%', maxWidth:650 }} options={institutions.map((x) => ({ value:x.id, label:x.ad || x.kresAdi || x.isim || x.id }))} />
      {selected && <div style={{ marginTop:10 }}><Text strong>{selected.ad || selected.kresAdi || selected.isim}</Text><Text type="secondary" style={{ marginLeft:12 }}>{formatInstitutionLocation(selected)}{selected.telefon ? ` · ${selected.telefon}` : ''}</Text></div>}
    </Card>
    {!kresId ? <Alert type="info" showIcon message="Önce bir kreş seçerek kuruluma başla." /> : <Card><Tabs items={tabs} destroyOnHidden={false} /></Card>}
  </div>;
}
