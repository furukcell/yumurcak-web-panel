import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';

const { Title, Text } = Typography;

export default function LoginPage() {
  const { girisYap, erisimHatasi } = useAuth();
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);

  async function onFinish({ email, password }) {
    setHata('');
    setYukleniyor(true);
    try {
      await girisYap(email, password);
    } catch (err) {
      setHata('Email veya şifre hatalı.');
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: THEME.bg,
      }}
    >
      <Card style={{ width: 360, borderRadius: 16, boxShadow: '0 8px 30px rgba(108,61,235,0.12)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ color: THEME.primary, marginBottom: 0 }}>Yumurcak</Title>
          <Text type="secondary">Yönetim Paneli</Text>
        </div>

        {(hata || erisimHatasi) && (
          <Alert type="error" message={hata || erisimHatasi} style={{ marginBottom: 16 }} showIcon />
        )}

        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Email gerekli' }]}>
            <Input prefix={<UserOutlined />} placeholder="ornek@kres.com" size="large" />
          </Form.Item>
          <Form.Item name="password" label="Şifre" rules={[{ required: true, message: 'Şifre gerekli' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="••••••••" size="large" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block size="large" loading={yukleniyor} style={{ background: THEME.primary }}>
              Giriş Yap
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
