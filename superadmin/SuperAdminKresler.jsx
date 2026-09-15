import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Input, Space, Table, Tag, Typography } from 'antd';
import { EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getPlatformSnapshot } from './superadminService';

const { Title, Text } = Typography;
const card = { borderRadius: 16, border: '1px solid #ECECF2', boxShadow: '0 8px 24px rgba(26,20,56,.05)' };

export default function SuperAdminKresler() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => getPlatformSnapshot().then(setData).catch((e) => setError(e?.message || 'Veriler alınamadı.'));
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return data.institutions.filter((r) => {
      if (!needle) return true;
      return [r.ad, r.adSoyad, r.isim, r.kresAdi, r.il, r.ilce, r.telefon, r.email].some((x) => String(x || '').toLocaleLowerCase('tr-TR').includes(needle));
    });
  }, [data, q]);

  const columns = [
    { title: 'Kurum', key: 'name', render: (_, r) => <div><Text strong>{r.ad || r.adSoyad || r.isim || r.kresAdi || 'İsimsiz kurum'}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{r.id}</Text></div> },
    { title: 'Konum', key: 'location', render: (_, r) => [r.il, r.ilce].filter(Boolean).join(' / ') || '—' },
    { title: 'Kullanıcı', key: 'users', align: 'center', render: (_, r) => data.usersByKres[r.id] || 0 },
    { title: 'Çocuk', key: 'children', align: 'center', render: (_, r) => data.childrenByKres[r.id] || 0 },
    { title: 'Sınıf', key: 'classes', align: 'center', render: (_, r) => data.classesByKres[r.id] || 0 },
    { title: 'Abonelik', key: 'subscription', render: (_, r) => data.subscriptionsByKres[r.id] ? <Tag color="green">Kayıt var</Tag> : <Tag>Yok</Tag> },
    { title: '', key: 'actions', align: 'right', render: (_, r) => <Button icon={<EyeOutlined />} onClick={() => navigate(`/superadmin/kresler/${r.id}`)}>Detay</Button> },
  ];

  return <div style={{ maxWidth: 1500, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', marginBottom: 20 }}>
      <div><Title level={2} style={{ margin: 0 }}>Kreşler</Title><Text type="secondary">Platformdaki tüm kurumları ve temel durumlarını yönet.</Text></div>
      <Space><Input allowClear prefix={<SearchOutlined />} placeholder="Kurum, il, telefon..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} /><Button icon={<ReloadOutlined />} onClick={load}>Yenile</Button></Space>
    </div>
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Card style={card}><Table rowKey="id" columns={columns} dataSource={rows} loading={!data} pagination={{ pageSize: 20, showSizeChanger: false }} /></Card>
  </div>;
}
