import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Typography, Badge } from 'antd';
import {
  DashboardOutlined,
  BarChartOutlined,
  LogoutOutlined,
  UserOutlined,
  TeamOutlined,
  SmileOutlined,
  ReadOutlined,
  ContactsOutlined,
  NotificationOutlined,
  CalendarOutlined,
  BarsOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { useUnreadMessagesCount } from '../utils/messageHelpers';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

// Faz 0-1: Dashboard + İstatistik, Faz 2: Çekirdek Yönetim (CRUD),
// Faz 3: İletişim eklendi (bkz. docs/web-panel-plan.md).
function buildMenuItems(unreadCount) {
  return [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/istatistik', icon: <BarChartOutlined />, label: 'İstatistik' },
    { key: '/siniflar', icon: <ReadOutlined />, label: 'Sınıflar' },
    { key: '/cocuklar', icon: <SmileOutlined />, label: 'Çocuklar' },
    { key: '/ogretmenler', icon: <TeamOutlined />, label: 'Öğretmenler' },
    { key: '/veliler', icon: <ContactsOutlined />, label: 'Veliler' },
    { key: '/duyurular', icon: <NotificationOutlined />, label: 'Duyurular' },
    { key: '/etkinlikler', icon: <CalendarOutlined />, label: 'Etkinlikler' },
    { key: '/anketler', icon: <BarsOutlined />, label: 'Anketler' },
    {
      key: '/mesajlar',
      icon: <MessageOutlined />,
      label: unreadCount > 0 ? <span>Mesajlar <Badge count={unreadCount} size="small" style={{ marginLeft: 4 }} /></span> : 'Mesajlar',
    },
  ];
}

export default function PanelLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { kullanici, kres, cikisYap } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const unreadCount = useUnreadMessagesCount(kullanici?.uid || kullanici?.id);
  const menuItems = buildMenuItems(unreadCount);

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
          items={menuItems}
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
