import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Col, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { ActivityOutlined, ApartmentOutlined, TeamOutlined } from '@ant-design/icons';
import { getPlatformSnapshot, getUsageLogs, normalizeUsageLogs } from './superadminService';

const { Title, Text } = Typography;
const card = { borderRadius: 16, border: '1px solid #ECECF2', boxShadow: '0 8px 24px rgba(26,20,56,.05)' };

function dateText(ts) { return ts ? new Date(Number(ts)).toLocaleString('tr-TR') : '—'; }

export default function SuperAdminAnalytics() {
  const [snapshot, setSnapshot] = useState(null);
  const [logs, setLogs] = useState([]);
  const [kresId, setKresId] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getPlatformSnapshot(), getUsageLogs()]).then(([s, raw]) => { setSnapshot(s); setLogs(normalizeUsageLogs(raw)); }).catch((e) => setError(e?.message || 'Analitik verileri alınamadı.'));
  }, []);

  const filtered = useMemo(() => kresId === 'all' ? logs : logs.filter((x) => x.kresId === kresId), [logs, kresId]);
  const users = useMemo(() => {
    const map = {};
    filtered.forEach((x) => {
      const id = x.kullaniciId || x.userId;
      if (!id) return;
      if (!map[id]) map[id] = { id, events: 0, last: 0, modules: new Set(), name: x.kullaniciAdi || x.userName || id, role: x.rol || x.role || '—' };
      map[id].events += 1;
      map[id].last = Math.max(map[id].last, Number(x.timestamp || 0));
      if (x.modul || x.module) map[id].modules.add(x.modul || x.module);
    });
    return Object.values(map).map((x) => ({ ...x, modules: [...x.modules].join(', ') || '—' })).sort((a, b) => b.events - a.events);
  }, [filtered]);

  const moduleRows = useMemo(() => {
    const map = {};
    filtered.forEach((x) => { const key = x.modul || x.module || 'Diğer'; map[key] = (map[key] || 0) + 1; });
    return Object.entries(map).map(([modul, events]) => ({ modul, events })).sort((a, b) => b.events - a.events);
  }, [filtered]);

  const kresOptions = snapshot?.institutions.map((r) => ({ value: r.id, label: r.ad || r.adSoyad || r.isim || r.kresAdi || r.id })) || [];
  if (error) return <Alert type="error" showIcon message="Analitik yüklenemedi" description={error} />;
  if (!snapshot) return <Card loading style={card} />;

  return <div style={{ maxWidth: 1500, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', marginBottom: 20 }}>
      <div><Title level={2} style={{ margin: 0 }}>Kullanım Analitiği</Title><Text type="secondary">Kim, ne zaman giriş yaptı ve hangi modülleri kullandı?</Text></div>
      <Select value={kresId} onChange={setKresId} style={{ minWidth: 260 }} options={[{ value: 'all', label: 'Tüm kurumlar' }, ...kresOptions]} showSearch optionFilterProp="label" />
    </div>

    <Row gutter={[16, 16]}>
      <Col xs={24} sm={8}><Card style={card}><Statistic title="Toplam aktivite" value={filtered.length} prefix={<ActivityOutlined />} /></Card></Col>
      <Col xs={24} sm={8}><Card style={card}><Statistic title="Aktif kullanıcı" value={users.length} prefix={<TeamOutlined />} /></Card></Col>
      <Col xs={24} sm={8}><Card style={card}><Statistic title="Aktif kurum" value={new Set(filtered.map((x) => x.kresId).filter(Boolean)).size} prefix={<ApartmentOutlined />} /></Card></Col>
    </Row>

    {!logs.length && <Alert style={{ marginTop: 16 }} type="warning" showIcon message="Henüz kullanım olayı kaydedilmemiş." description="Bu ekran hazır; uygulama kullanım olayları yazılmaya başladığında kullanıcı ve modül detayları burada otomatik görünecek." />}

    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
      <Col xs={24} lg={14}><Card style={card} title="Kullanıcı Aktivitesi"><Table rowKey="id" size="small" pagination={{ pageSize: 15 }} columns={[{ title: 'Kullanıcı', dataIndex: 'name', render: (v, r) => <div><Text strong>{v}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{r.role}</Text></div> }, { title: 'Aktivite', dataIndex: 'events', sorter: (a,b) => a.events-b.events }, { title: 'Kullanılan modüller', dataIndex: 'modules', render: (v) => <Tag>{v}</Tag> }, { title: 'Son aktivite', dataIndex: 'last', render: dateText }]} dataSource={users} /></Card></Col>
      <Col xs={24} lg={10}><Card style={card} title="Modül Kullanımı"><Table rowKey="modul" size="small" pagination={false} columns={[{ title: 'Modül', dataIndex: 'modul' }, { title: 'Olay', dataIndex: 'events', align: 'right' }]} dataSource={moduleRows} locale={{ emptyText: 'Kayıt yok' }} /></Card></Col>
    </Row>

    <Card style={{ ...card, marginTop: 16 }} title="Son Kullanım Olayları">
      <Table rowKey="id" size="small" pagination={{ pageSize: 20 }} dataSource={filtered.slice(0, 300)} columns={[{ title: 'Zaman', dataIndex: 'timestamp', render: dateText }, { title: 'Kullanıcı', dataIndex: 'kullaniciAdi', render: (v, r) => v || r.userName || r.kullaniciId || r.userId || '—' }, { title: 'Kurum', dataIndex: 'kresId', render: (v) => v || '—' }, { title: 'Modül', dataIndex: 'modul', render: (v, r) => v || r.module || '—' }, { title: 'İşlem', dataIndex: 'islem', render: (v, r) => v || r.action || '—' }]} />
    </Card>
  </div>;
}
