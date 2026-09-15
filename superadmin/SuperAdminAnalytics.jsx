import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Col, Row, Select, Table, Tag, Typography, Statistic, Progress } from 'antd';
import { ThunderboltOutlined, ApartmentOutlined, TeamOutlined, LoginOutlined } from '@ant-design/icons';
import { getPlatformSnapshot, getUsageLogs, normalizeUsageLogs, usageSummary } from './superadminService';

const { Title, Text } = Typography;
const card = { borderRadius: 16, border: '1px solid #ECECF2', boxShadow: '0 8px 24px rgba(26,20,56,.05)' };

function dateText(ts) { return ts ? new Date(Number(ts)).toLocaleString('tr-TR') : '—'; }

function getInstitutionName(institution, id) {
  return institution?.ad || institution?.adSoyad || institution?.isim || institution?.kresAdi || id;
}

export default function SuperAdminAnalytics() {
  const [snapshot, setSnapshot] = useState(null);
  const [logs, setLogs] = useState([]);
  const [kresId, setKresId] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getPlatformSnapshot(), getUsageLogs()])
      .then(([s, raw]) => { setSnapshot(s); setLogs(normalizeUsageLogs(raw)); })
      .catch((e) => setError(e?.message || 'Analitik verileri alınamadı.'));
  }, []);

  const filtered = useMemo(() => kresId === 'all' ? logs : logs.filter((x) => x.kresId === kresId), [logs, kresId]);
  const summary = useMemo(() => usageSummary(filtered), [filtered]);

  const users = useMemo(() => {
    const map = {};
    filtered.forEach((x) => {
      const id = x.kullaniciId || x.userId;
      if (!id) return;
      if (!map[id]) map[id] = { id, events: 0, last: 0, today: 0, last7: 0, modules: new Set(), name: x.kullaniciAdi || x.userName || id, role: x.rol || x.role || '—' };
      map[id].events += 1;
      map[id].last = Math.max(map[id].last, Number(x.timestamp || 0));
      if (Number(x.timestamp || 0) >= summary.todayStart) map[id].today += 1;
      if (Number(x.timestamp || 0) >= summary.last7Start) map[id].last7 += 1;
      if (x.modul || x.module) map[id].modules.add(x.modul || x.module);
    });
    return Object.values(map)
      .map((x) => ({ ...x, modules: [...x.modules].join(', ') || '—' }))
      .sort((a, b) => b.events - a.events);
  }, [filtered, summary]);

  const moduleRows = useMemo(() => {
    const map = {};
    filtered.forEach((x) => { const key = x.modul || x.module || 'Diğer'; map[key] = (map[key] || 0) + 1; });
    return Object.entries(map).map(([modul, events]) => ({ modul, events })).sort((a, b) => b.events - a.events);
  }, [filtered]);

  const institutionRows = useMemo(() => {
    const institutionMap = {};
    const userSets = {};
    filtered.forEach((x) => {
      const id = x.kresId;
      if (!id) return;
      institutionMap[id] = (institutionMap[id] || 0) + 1;
      if (!userSets[id]) userSets[id] = new Set();
      if (x.kullaniciId) userSets[id].add(x.kullaniciId);
    });

    return Object.entries(snapshot?.institutions || []).map(([id, institution]) => {
      const events = institutionMap[id] || 0;
      const activeUsers = userSets[id]?.size || 0;
      const totalUsers = snapshot?.usersByKres?.[id] || 0;
      const usage = totalUsers ? Math.min(100, Math.round((activeUsers / totalUsers) * 100)) : (events ? 100 : 0);
      return { id, name: getInstitutionName(institution, id), events, activeUsers, totalUsers, usage };
    }).filter((row) => kresId === 'all' || row.id === kresId).sort((a, b) => b.usage - a.usage || b.events - a.events);
  }, [filtered, snapshot, kresId]);

  const kresOptions = snapshot?.institutions.map((r) => ({ value: r.id, label: getInstitutionName(r, r.id) })) || [];
  if (error) return <Alert type="error" showIcon message="Analitik yüklenemedi" description={error} />;
  if (!snapshot) return <Card loading style={card} />;

  return <div style={{ maxWidth: 1500, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', marginBottom: 20 }}>
      <div><Title level={2} style={{ margin: 0 }}>Kullanım Analitiği</Title><Text type="secondary">Kim, ne zaman giriş yaptı ve hangi modülleri kullandı?</Text></div>
      <Select value={kresId} onChange={setKresId} style={{ minWidth: 260 }} options={[{ value: 'all', label: 'Tüm kurumlar' }, ...kresOptions]} showSearch optionFilterProp="label" />
    </div>

    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Bugünkü aktiviteler" value={summary.todayEvents} prefix={<ThunderboltOutlined />} /></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Bugün aktif kullanıcı" value={summary.activeUsersToday} prefix={<TeamOutlined />} /></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="7 günde aktif kullanıcı" value={summary.activeUsers7d} prefix={<LoginOutlined />} /></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Bugün aktif kurum" value={summary.activeInstitutionsToday} prefix={<ApartmentOutlined />} /></Card></Col>
    </Row>

    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
      <Col xs={24} lg={14}>
        <Card style={card} title="Kurum Kullanım Sağlığı">
          <Table rowKey="id" size="small" pagination={{ pageSize: 12 }} columns={[
            { title: 'Kurum', dataIndex: 'name', ellipsis: true },
            { title: 'Aktif kullanıcı', render: (_, r) => `${r.activeUsers} / ${r.totalUsers}` },
            { title: 'Aktivite', dataIndex: 'events' },
            { title: 'Kullanım %', dataIndex: 'usage', render: (v) => <Progress percent={v} size="small" /> },
          ]} dataSource={institutionRows} locale={{ emptyText: 'Henüz kullanım verisi yok' }} />
        </Card>
      </Col>
      <Col xs={24} lg={10}>
        <Card style={card} title="Modül Kullanımı">
          <Table rowKey="modul" size="small" pagination={false} columns={[{ title: 'Modül', dataIndex: 'modul' }, { title: 'Olay', dataIndex: 'events', align: 'right' }]} dataSource={moduleRows} locale={{ emptyText: 'Kayıt yok' }} />
        </Card>
      </Col>
    </Row>

    {!logs.length && <Alert style={{ marginTop: 16 }} type="warning" showIcon message="Henüz kullanım olayı kaydedilmemiş." description="Takip altyapısı artık aktif. Kullanıcılar uygulamayı açıp ekranlar arasında gezdikçe veriler burada oluşacak." />}

    <Card style={{ ...card, marginTop: 16 }} title="Kullanıcı Aktivitesi">
      <Table rowKey="id" size="small" pagination={{ pageSize: 15 }} columns={[
        { title: 'Kullanıcı', dataIndex: 'name', render: (v, r) => <div><Text strong>{v}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{r.role}</Text></div> },
        { title: 'Bugün', dataIndex: 'today' },
        { title: 'Son 7 gün', dataIndex: 'last7' },
        { title: 'Toplam aktivite', dataIndex: 'events', sorter: (a, b) => a.events - b.events },
        { title: 'Kullanılan modüller', dataIndex: 'modules', render: (v) => <Tag>{v}</Tag> },
        { title: 'Son aktivite', dataIndex: 'last', render: dateText },
      ]} dataSource={users} />
    </Card>

    <Card style={{ ...card, marginTop: 16 }} title="Son Kullanım Olayları">
      <Table rowKey="id" size="small" pagination={{ pageSize: 20 }} dataSource={filtered.slice(0, 300)} columns={[
        { title: 'Zaman', dataIndex: 'timestamp', render: dateText },
        { title: 'Kullanıcı', dataIndex: 'kullaniciAdi', render: (v, r) => v || r.userName || r.kullaniciId || r.userId || '—' },
        { title: 'Kurum', dataIndex: 'kresId', render: (v) => getInstitutionName(snapshot.institutions.find((i) => i.id === v), v) },
        { title: 'Modül', dataIndex: 'modul', render: (v, r) => v || r.module || '—' },
        { title: 'İşlem', dataIndex: 'islem', render: (v, r) => v || r.action || '—' },
        { title: 'Ekran', dataIndex: 'screen', render: (v) => v || '—' },
      ]} />
    </Card>
  </div>;
}
