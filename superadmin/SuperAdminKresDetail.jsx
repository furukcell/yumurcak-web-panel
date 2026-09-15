import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Descriptions, Row, Statistic, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, ApartmentOutlined, TeamOutlined, SmileOutlined, ReadOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { getPlatformSnapshot } from './superadminService';

const { Title, Text } = Typography;
const card = { borderRadius: 16, border: '1px solid #ECECF2', boxShadow: '0 8px 24px rgba(26,20,56,.05)' };

export default function SuperAdminKresDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { getPlatformSnapshot().then(setData).catch((e) => setError(e?.message || 'Kurum verisi alınamadı.')); }, [id]);

  const institution = useMemo(() => data?.institutions.find((x) => x.id === id), [data, id]);
  if (error) return <Alert type="error" showIcon message="Kurum detayı yüklenemedi" description={error} />;
  if (!data) return <Card loading style={card} />;
  if (!institution) return <Alert type="warning" showIcon message="Kurum bulunamadı" action={<Button onClick={() => navigate('/superadmin/kresler')}>Kreşlere dön</Button>} />;

  const name = institution.ad || institution.adSoyad || institution.isim || institution.kresAdi || 'İsimsiz kurum';
  const users = data.users.filter((x) => x.kresId === id);
  const children = data.children.filter((x) => x.kresId === id);
  const classes = data.classes.filter((x) => x.kresId === id);
  const subscription = data.subscriptionsByKres[id];

  return <div style={{ maxWidth: 1400, margin: '0 auto' }}>
    <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/superadmin/kresler')} style={{ marginBottom: 10 }}>Kreşlere dön</Button>
    <div style={{ marginBottom: 22 }}><Title level={2} style={{ margin: 0 }}>{name}</Title><Text type="secondary">Kurum ID: {id}</Text></div>
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={8} lg={6}><Card style={card}><Statistic title="Kullanıcı" value={users.length} prefix={<TeamOutlined />} /></Card></Col>
      <Col xs={24} sm={8} lg={6}><Card style={card}><Statistic title="Çocuk" value={children.length} prefix={<SmileOutlined />} /></Card></Col>
      <Col xs={24} sm={8} lg={6}><Card style={card}><Statistic title="Sınıf" value={classes.length} prefix={<ReadOutlined />} /></Card></Col>
      <Col xs={24} sm={8} lg={6}><Card style={card}><Statistic title="Abonelik" value={subscription ? 'Var' : 'Yok'} prefix={<ApartmentOutlined />} /></Card></Col>
    </Row>
    <Card style={{ ...card, marginTop: 16 }} title="Kurum Bilgileri">
      <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} bordered size="small">
        <Descriptions.Item label="Kurum">{name}</Descriptions.Item>
        <Descriptions.Item label="İl">{institution.il || '—'}</Descriptions.Item>
        <Descriptions.Item label="İlçe">{institution.ilce || '—'}</Descriptions.Item>
        <Descriptions.Item label="Telefon">{institution.telefon || institution.phone || '—'}</Descriptions.Item>
        <Descriptions.Item label="E-posta">{institution.email || '—'}</Descriptions.Item>
        <Descriptions.Item label="Abonelik">{subscription ? <Tag color="green">Kayıt mevcut</Tag> : <Tag>Yok</Tag>}</Descriptions.Item>
      </Descriptions>
    </Card>
  </div>;
}
