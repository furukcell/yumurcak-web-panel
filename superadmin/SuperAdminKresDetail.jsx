import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Descriptions, Empty, Progress, Row, Statistic, Table, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, ApartmentOutlined, TeamOutlined, SmileOutlined, ReadOutlined, ThunderboltOutlined, LoginOutlined, RiseOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { getPlatformSnapshot, getUsageLogs, normalizeUsageLogs } from './superadminService';

const { Title, Text } = Typography;
const card = { borderRadius: 16, border: '1px solid #ECECF2', boxShadow: '0 8px 24px rgba(26,20,56,.05)' };
const DAY = 86400000;
function dateText(ts) { return ts ? new Date(Number(ts)).toLocaleString('tr-TR') : '—'; }
function health(score) { if (score >= 75) return { label: 'Çok aktif', color: 'green' }; if (score >= 50) return { label: 'Aktif', color: 'blue' }; if (score >= 20) return { label: 'Düşük kullanım', color: 'orange' }; return { label: 'Pasif', color: 'red' }; }

export default function SuperAdminKresDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getPlatformSnapshot(), getUsageLogs()])
      .then(([snapshot, raw]) => { setData(snapshot); setLogs(normalizeUsageLogs(raw)); })
      .catch((e) => setError(e?.message || 'Kurum verisi alınamadı.'));
  }, [id]);

  const institution = useMemo(() => data?.institutions.find((x) => x.id === id), [data, id]);
  if (error) return <Alert type="error" showIcon message="Kurum detayı yüklenemedi" description={error} />;
  if (!data) return <Card loading style={card} />;
  if (!institution) return <Alert type="warning" showIcon message="Kurum bulunamadı" action={<Button onClick={() => navigate('/superadmin/analytics')}>Analitiğe dön</Button>} />;

  const name = institution.ad || institution.adSoyad || institution.isim || institution.kresAdi || 'İsimsiz kurum';
  const users = data.users.filter((x) => x.kresId === id);
  const children = data.children.filter((x) => x.kresId === id);
  const classes = data.classes.filter((x) => x.kresId === id);
  const subscription = data.subscriptionsByKres[id];
  const institutionLogs = logs.filter((x) => x.kresId === id);
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const last7Start = now - 7 * DAY;
  const last30Start = now - 30 * DAY;
  const inPeriod = (from) => institutionLogs.filter((x) => Number(x.timestamp) >= from);
  const todayLogs = inPeriod(todayStart);
  const logs7 = inPeriod(last7Start);
  const logs30 = inPeriod(last30Start);
  const activeToday = new Set(todayLogs.map((x) => x.kullaniciId).filter(Boolean));
  const active7 = new Set(logs7.map((x) => x.kullaniciId).filter(Boolean));
  const active30 = new Set(logs30.map((x) => x.kullaniciId).filter(Boolean));
  const loginEvents = institutionLogs.filter((x) => ['login', 'giris', 'app_open'].includes(String(x.action || x.islem || '').toLowerCase()));
  const loginToday = loginEvents.filter((x) => Number(x.timestamp) >= todayStart).length;
  const login7 = loginEvents.filter((x) => Number(x.timestamp) >= last7Start).length;
  const moduleMap = {};
  institutionLogs.forEach((x) => { const module = x.modul || x.module || 'Diğer'; moduleMap[module] = (moduleMap[module] || 0) + 1; });
  const moduleRows = Object.entries(moduleMap).map(([module, events]) => ({ module, events, users: new Set(institutionLogs.filter((x) => (x.modul || x.module || 'Diğer') === module).map((x) => x.kullaniciId).filter(Boolean)).size })).sort((a, b) => b.events - a.events);
  const userMap = {};
  institutionLogs.forEach((x) => {
    const uid = x.kullaniciId || x.userId; if (!uid) return;
    if (!userMap[uid]) userMap[uid] = { id: uid, name: x.kullaniciAdi || x.userName || uid, role: x.rol || x.role || '—', events: 0, logins: 0, last: 0, modules: new Set(), today: 0, last7: 0 };
    const row = userMap[uid]; const ts = Number(x.timestamp || 0); row.events += 1; row.last = Math.max(row.last, ts); if (ts >= todayStart) row.today += 1; if (ts >= last7Start) row.last7 += 1;
    if (['login', 'giris', 'app_open'].includes(String(x.action || x.islem || '').toLowerCase())) row.logins += 1;
    if (x.modul || x.module) row.modules.add(x.modul || x.module);
  });
  const userRows = Object.values(userMap).map((x) => ({ ...x, modules: [...x.modules].join(', ') || '—' })).sort((a, b) => b.events - a.events);
  const activeUserRatio = users.length ? active7.size / users.length * 100 : (institutionLogs.length ? 100 : 0);
  const score = Math.min(100, Math.round(activeUserRatio * .55 + Math.min(logs7.length, 100) * .25 + Math.min(moduleRows.length, 8) / 8 * 20));
  const h = health(score);
  const daily = [];
  for (let i = 13; i >= 0; i -= 1) { const d = new Date(now - i * DAY); d.setHours(0, 0, 0, 0); const from = d.getTime(); const dayRows = institutionLogs.filter((x) => Number(x.timestamp) >= from && Number(x.timestamp) < from + DAY); daily.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }), events: dayRows.length, users: new Set(dayRows.map((x) => x.kullaniciId).filter(Boolean)).size }); }
  const dailyMax = Math.max(1, ...daily.map((x) => x.events));

  return <div style={{ maxWidth: 1500, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/superadmin/analytics')}>Analitiğe dön</Button>
      <Button type="primary" icon={<UsergroupAddOutlined />} onClick={() => navigate(`/superadmin/toplu-kurulum?kresId=${encodeURIComponent(id)}`)}>Toplu Kurulum</Button>
    </div>
    <div style={{ marginBottom: 22 }}><Title level={2} style={{ margin: 0 }}>{name}</Title><Text type="secondary">Kurum ID: {id}</Text></div>

    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Kullanıcı" value={users.length} prefix={<TeamOutlined />} /></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Bugün aktif" value={activeToday.size} suffix={`/ ${users.length}`} prefix={<ThunderboltOutlined />} /></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="7 günde aktif" value={active7.size} suffix={`/ ${users.length}`} prefix={<LoginOutlined />} /></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Toplam aktivite" value={institutionLogs.length} prefix={<RiseOutlined />} /></Card></Col>
    </Row>

    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
      <Col xs={24} lg={8}><Card style={card} title="Kullanım Sağlığı"><div style={{ textAlign: 'center', padding: '10px 0' }}><Progress type="circle" percent={score} size={145} /><div style={{ marginTop: 12 }}><Tag color={h.color}>{h.label}</Tag></div><Text type="secondary" style={{ display: 'block', marginTop: 8 }}>7 günlük aktif kullanıcı + aktivite + modül çeşitliliği</Text></div></Card></Col>
      <Col xs={24} lg={16}><Card style={card} title="Kullanım Özeti"><Row gutter={[12, 12]}><Col xs={12} sm={6}><Statistic title="Bugünkü aktivite" value={todayLogs.length} /></Col><Col xs={12} sm={6}><Statistic title="7 günlük aktivite" value={logs7.length} /></Col><Col xs={12} sm={6}><Statistic title="30 günlük aktivite" value={logs30.length} /></Col><Col xs={12} sm={6}><Statistic title="Bugün giriş / açılış" value={loginToday} /></Col><Col xs={12} sm={6}><Statistic title="7 gün giriş / açılış" value={login7} /></Col><Col xs={12} sm={6}><Statistic title="30 gün aktif kullanıcı" value={active30.size} /></Col><Col xs={12} sm={6}><Statistic title="Kullanılan modül" value={moduleRows.length} /></Col><Col xs={12} sm={6}><Statistic title="Son aktivite" value={institutionLogs[0] ? dateText(institutionLogs[0].timestamp) : '—'} valueStyle={{ fontSize: 13 }} /></Col></Row></Card></Col>
    </Row>

    <Card style={{ ...card, marginTop: 16 }} title="Son 14 Gün — Kurum Kullanım Trendi">
      {daily.some((x) => x.events) ? <div style={{ height: 220, display: 'flex', alignItems: 'flex-end', gap: 7, padding: '18px 6px 8px', overflowX: 'auto' }}>{daily.map((x) => <div key={x.key} title={`${x.label}: ${x.events} aktivite, ${x.users} aktif kullanıcı`} style={{ minWidth: 38, flex: 1, maxWidth: 70, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}><Text style={{ fontSize: 10 }}>{x.events || ''}</Text><div style={{ width: '65%', minHeight: x.events ? 5 : 2, height: `${Math.max(1, x.events / dailyMax * 100)}%`, background: 'linear-gradient(180deg,#1677ff,#69b1ff)', borderRadius: '6px 6px 2px 2px' }} /><Text type="secondary" style={{ fontSize: 9, marginTop: 6, whiteSpace: 'nowrap' }}>{x.label}</Text></div>)}</div> : <Empty description="Henüz kurum kullanım verisi yok" />}
    </Card>

    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
      <Col xs={24} lg={10}><Card style={card} title="Modül Kullanımı"><Table rowKey="module" size="small" pagination={false} dataSource={moduleRows} columns={[{ title: 'Modül', dataIndex: 'module' }, { title: 'Kullanım', dataIndex: 'events', align: 'right' }, { title: 'Kullanıcı', dataIndex: 'users', align: 'right' }]} locale={{ emptyText: 'Henüz modül kullanımı yok' }} /></Card></Col>
      <Col xs={24} lg={14}><Card style={card} title="Kullanıcı Bazlı Aktivite"><Table rowKey="id" size="small" pagination={{ pageSize: 10 }} dataSource={userRows} columns={[{ title: 'Kullanıcı', dataIndex: 'name', render: (v, r) => <div><Text strong>{v}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{r.role}</Text></div> }, { title: 'Bugün', dataIndex: 'today' }, { title: '7 gün', dataIndex: 'last7' }, { title: 'Giriş/Açılış', dataIndex: 'logins' }, { title: 'Toplam', dataIndex: 'events' }, { title: 'Nerelerde kullandı', dataIndex: 'modules', ellipsis: true }, { title: 'Son', dataIndex: 'last', render: dateText }]} locale={{ emptyText: 'Henüz kullanıcı aktivitesi yok' }} /></Card></Col>
    </Row>

    <Card style={{ ...card, marginTop: 16 }} title="Son Kullanım Olayları"><Table rowKey="id" size="small" pagination={{ pageSize: 20 }} dataSource={institutionLogs.slice(0, 300)} columns={[{ title: 'Zaman', dataIndex: 'timestamp', render: dateText }, { title: 'Kullanıcı', dataIndex: 'kullaniciAdi', render: (v, r) => v || r.userName || r.kullaniciId || '—' }, { title: 'Modül', dataIndex: 'modul', render: (v, r) => v || r.module || '—' }, { title: 'İşlem', dataIndex: 'islem', render: (v, r) => v || r.action || '—' }, { title: 'Ekran', dataIndex: 'screen', render: (v) => v || '—' }]} locale={{ emptyText: 'Henüz olay kaydı yok' }} /></Card>

    <Card style={{ ...card, marginTop: 16 }} title="Kurum Bilgileri">
      <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} bordered size="small">
        <Descriptions.Item label="Kurum">{name}</Descriptions.Item><Descriptions.Item label="İl">{institution.il || '—'}</Descriptions.Item><Descriptions.Item label="İlçe">{institution.ilce || '—'}</Descriptions.Item><Descriptions.Item label="Telefon">{institution.telefon || institution.phone || '—'}</Descriptions.Item><Descriptions.Item label="E-posta">{institution.email || '—'}</Descriptions.Item><Descriptions.Item label="Abonelik">{subscription ? <Tag color="green">Kayıt mevcut</Tag> : <Tag>Yok</Tag>}</Descriptions.Item><Descriptions.Item label="Çocuk">{children.length}</Descriptions.Item><Descriptions.Item label="Sınıf">{classes.length}</Descriptions.Item><Descriptions.Item label="Toplam kullanıcı">{users.length}</Descriptions.Item>
      </Descriptions>
    </Card>
  </div>;
}
