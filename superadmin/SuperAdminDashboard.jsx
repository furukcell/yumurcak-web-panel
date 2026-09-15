import React, { useEffect, useState } from 'react';
import { Alert, Card, Col, Row, Skeleton, Statistic, Table, Tag, Typography } from 'antd';
import { ApartmentOutlined, TeamOutlined, SmileOutlined, CrownOutlined, ActivityOutlined } from '@ant-design/icons';
import { getPlatformSnapshot, getUsageLogs, normalizeUsageLogs, usageSummary } from './superadminService';

const { Title, Text } = Typography;
const card = { borderRadius: 16, border: '1px solid #ECECF2', boxShadow: '0 8px 24px rgba(26,20,56,.05)' };

export default function SuperAdminDashboard() {
  const [data, setData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getPlatformSnapshot(), getUsageLogs()])
      .then(([snapshot, rawLogs]) => { setData(snapshot); setLogs(normalizeUsageLogs(rawLogs)); })
      .catch((e) => setError(e?.message || 'Platform verileri alınamadı.'));
  }, []);

  if (error) return <Alert type="error" showIcon message="SuperAdmin verileri yüklenemedi" description={error} />;
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;

  const usage = usageSummary(logs);
  const recent = [...data.institutions].sort((a, b) => String(a.ad || a.adSoyad || a.isim || '').localeCompare(String(b.ad || b.adSoyad || b.isim || ''), 'tr')).slice(0, 8);

  const columns = [
    { title: 'Kreş / Kurum', key: 'name', render: (_, r) => <Text strong>{r.ad || r.adSoyad || r.isim || r.kresAdi || 'İsimsiz kurum'}</Text> },
    { title: 'İl / İlçe', key: 'location', render: (_, r) => [r.il, r.ilce].filter(Boolean).join(' / ') || '—' },
    { title: 'Kullanıcı', key: 'users', align: 'center', render: (_, r) => data.usersByKres[r.id] || 0 },
    { title: 'Çocuk', key: 'children', align: 'center', render: (_, r) => data.childrenByKres[r.id] || 0 },
    { title: 'Sınıf', key: 'classes', align: 'center', render: (_, r) => data.classesByKres[r.id] || 0 },
    { title: 'Durum', key: 'status', render: (_, r) => <Tag color={data.subscriptionsByKres[r.id] ? 'green' : 'default'}>{data.subscriptionsByKres[r.id] ? 'Abonelik kaydı var' : 'Abonelik yok'}</Tag> },
  ];

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>Platform Dashboard</Title>
        <Text type="secondary">Yumurcak platformunun genel durumunu tek ekrandan takip et.</Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Toplam Kreş" value={data.institutions.length} prefix={<ApartmentOutlined />} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Toplam Kullanıcı" value={data.users.length} prefix={<TeamOutlined />} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Toplam Çocuk" value={data.children.length} prefix={<SmileOutlined />} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Abonelik Kaydı" value={data.subscriptions.length} prefix={<CrownOutlined />} /></Card></Col>
      </Row>

      <Card style={{ ...card, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}><ActivityOutlined /><Title level={4} style={{ margin: 0 }}>Kullanım Özeti</Title></div>
        <Row gutter={[24, 20]}>
          <Col xs={12} md={6}><Statistic title="Bugünkü aktivite" value={usage.todayEvents} /></Col>
          <Col xs={12} md={6}><Statistic title="Bugün aktif kullanıcı" value={usage.activeUsersToday} /></Col>
          <Col xs={12} md={6}><Statistic title="Son 7 gün aktif" value={usage.activeUsers7d} /></Col>
          <Col xs={12} md={6}><Statistic title="Son 30 gün aktif" value={usage.activeUsers30d} /></Col>
        </Row>
        <Alert style={{ marginTop: 18 }} type="info" showIcon message={logs.length ? `${logs.length.toLocaleString('tr-TR')} kullanım kaydı analiz ediliyor.` : 'Henüz kullanım kaydı bulunmuyor.'} description={logs.length ? 'Detaylı kullanıcı ve modül kırılımını Kullanım Analitiği ekranından görebilirsin.' : 'Kullanım olayları kaydedilmeye başladığında bu bölüm otomatik dolacaktır.'} />
      </Card>

      <Card style={{ ...card, marginTop: 16 }} title="Kurum Özeti">
        <Table rowKey="id" size="middle" columns={columns} dataSource={recent} pagination={false} />
      </Card>
    </div>
  );
}
