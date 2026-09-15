import React from 'react';
import { Layout, Menu, Typography, Dropdown, Avatar } from 'antd';
import { DashboardOutlined, ApartmentOutlined, BarChartOutlined, CrownOutlined, LogoutOutlined, UsergroupAddOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../src/context/AuthContext';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const items = [
  { key: '/superadmin', icon: <DashboardOutlined />, label: 'Platform Dashboard' },
  { key: '/superadmin/kresler', icon: <ApartmentOutlined />, label: 'Kreşler' },
  { key: '/superadmin/analytics', icon: <BarChartOutlined />, label: 'Kullanım Analitiği' },
  { key: '/superadmin/toplu-kurulum', icon: <UsergroupAddOutlined />, label: 'Toplu Kurulum' },
  { key: '/superadmin/destek', icon: <CustomerServiceOutlined />, label: 'Destek Merkezi' },
  { key: '/superadmin/abonelikler', icon: <CrownOutlined />, label: 'Abonelikler' },
];

export default function SuperAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { kullanici, cikisYap } = useAuth();
  const activeKey = items.some((item) => location.pathname === item.key || location.pathname.startsWith(`${item.key}/`))
    ? items.find((item) => location.pathname === item.key || location.pathname.startsWith(`${item.key}/`))?.key
    : '/superadmin';

  const menu = { items: [{ key: 'cikis', icon: <LogoutOutlined />, label: 'Çıkış Yap' }], onClick: async ({ key }) => { if (key === 'cikis') await cikisYap(); } };

  return (
    <Layout style={{ minHeight: '100vh', background: '#F7F8FC' }}>
      <Sider width={248} theme="dark" style={{ background: '#17152A' }}>
        <div style={{ height: 76, padding: '0 22px', display: 'flex', alignItems: 'center', gap: 11 }}>
          <img src="/logo.png" alt="Yumurcak" style={{ width: 40, height: 40, borderRadius: 12 }} />
          <div><Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>Yumurcak</Text><Text style={{ color: '#A9A5BE', fontSize: 11 }}>Platform Yönetimi</Text></div>
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[activeKey]} items={items} onClick={({ key }) => navigate(key)} style={{ background: 'transparent', border: 0, padding: '8px 10px' }} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', borderBottom: '1px solid #ECECF2', padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div><Text strong style={{ fontSize: 16 }}>SuperAdmin</Text><Text type="secondary" style={{ marginLeft: 10, fontSize: 12 }}>Yumurcak Platform</Text></div>
          <Dropdown menu={menu} placement="bottomRight"><div style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}><Avatar style={{ background: '#6C3DEB' }}>{String(kullanici?.adSoyad || kullanici?.ad || 'S').charAt(0).toUpperCase()}</Avatar><div style={{ lineHeight: 1.2 }}><Text strong style={{ display: 'block', fontSize: 13 }}>{kullanici?.adSoyad || kullanici?.ad || 'SuperAdmin'}</Text><Text type="secondary" style={{ fontSize: 11 }}>SuperAdmin</Text></div></div></Dropdown>
        </Header>
        <Content style={{ padding: 28, minHeight: 0 }}><Outlet /></Content>
      </Layout>
    </Layout>
  );
}
