import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Typography } from 'antd';
import {
  DashboardOutlined,
  BarChartOutlined,
  LogoutOutlined,
  UserOutlined,
  TeamOutlined,
  SmileOutlined,
  ReadOutlined,
  ContactsOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

// Faz 0-1'de Dashboard + İstatistik, Faz 2'de Çekirdek Yönetim (CRUD)
// eklendi (bkz. docs/web-panel-plan.md).
const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/istatistik', icon: <BarChartOutlined />, label: 'İstatistik' },
  { key: '/siniflar', icon: <ReadOutlined />, label: 'Sınıflar' },
  { key: '/cocuklar', icon: <SmileOutlined />, label: 'Çocuklar' },
  { key: '/ogretmenler', icon: <TeamOutlined />, label: 'Öğretmenler' },
  { key: '/veliler', icon: <ContactsOutlined />, label: 'Veliler' },
];

export default function PanelLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { kullanici, kres, cikisYap } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const userMenu = {
    items: [
      { key: 'cikis', icon: <LogoutOutlined />, label: 'Çıkış Yap' },
    ],
    onClick: async ({ key }) => {
      if (key === 'cikis') await cikisYap();
    },
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light" width={230}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text strong style={{ color: THEME.primary, fontSize: collapsed ? 16 : 20 }}>
            {collapsed ? 'Y' : 'Yumurcak'}
          </Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${THEME.border}` }}>
          <Text strong>{kres?.ad || kres?.isim || 'Kreş'}</Text>
          <Dropdown menu={userMenu} placement="bottomRight">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} style={{ background: THEME.primary }} />
              <Text>{kullanici?.ad || kullanici?.kullaniciAdi || kullanici?.email}</Text>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: 20, background: '#fff', padding: 20, borderRadius: 12 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
