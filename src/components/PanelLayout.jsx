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
  CoffeeOutlined,
  ScheduleOutlined,
  CarOutlined,
  GiftOutlined,
  SolutionOutlined,
  WalletOutlined,
  SettingOutlined,
  BgColorsOutlined,
  CrownOutlined,
  BellOutlined,
  FileProtectOutlined,
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
    { key: '/yemek-listesi', icon: <CoffeeOutlined />, label: 'Yemek Listesi' },
    { key: '/ders-programi', icon: <ScheduleOutlined />, label: 'Ders Programı' },
    { key: '/nobet-cizelgesi', icon: <SolutionOutlined />, label: 'Nöbet Çizelgesi' },
    { key: '/personel-gorevleri', icon: <SolutionOutlined />, label: 'Personel Görevleri' },
    { key: '/servis', icon: <CarOutlined />, label: 'Servis' },
    { key: '/dogum-gunleri', icon: <GiftOutlined />, label: 'Doğum Günleri' },
    { key: '/odemeler', icon: <WalletOutlined />, label: 'Ödemeler' },
    { key: '/ayarlar/kurum', icon: <SettingOutlined />, label: 'Kurum Bilgileri' },
    { key: '/ayarlar/tema', icon: <BgColorsOutlined />, label: 'Tema Ayarları' },
    { key: '/ayarlar/abonelik', icon: <CrownOutlined />, label: 'Abonelik' },
    { key: '/ayarlar/kurum-zili', icon: <BellOutlined />, label: 'Kurum Zili' },
    { key: '/yasal-belgeler', icon: <FileProtectOutlined />, label: 'Yasal Belgeler' },
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
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        width={236}
        style={{ background: '#FDFCFF', borderRight: `1px solid ${THEME.border}` }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
            padding: collapsed ? 0 : '0 20px',
          }}
        >
          <img
            src="/logo.png"
            alt="Yumurcak Kreş"
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              flexShrink: 0,
              boxShadow: '0 3px 10px rgba(76,41,156,0.22)',
            }}
          />
          {!collapsed && (
            <Text strong style={{ color: THEME.text, fontSize: 18, letterSpacing: -0.2 }}>
              Yumurcak
            </Text>
          )}
        </div>
        <div style={{ padding: '4px 10px' }}>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ background: 'transparent', border: 'none' }}
          />
        </div>
      </Sider>
      <Layout>
        <Header
          style={{
            background: 'rgba(255,255,255,0.82)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 12px rgba(25, 26, 35, 0.05)',
            position: 'sticky',
            top: 0,
            zIndex: 2,
          }}
        >
          <div
            onClick={() => navigate('/ayarlar/kurum')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              padding: '6px 14px 6px 6px',
              borderRadius: 999,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = THEME.bg)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <img
              src={kres?.logoUrl || '/logo.png'}
              alt={kres?.ad || kres?.isim || 'Kurum'}
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                objectFit: 'cover',
                border: `2px solid ${THEME.primarySoft}`,
              }}
            />
            <div style={{ lineHeight: 1.15 }}>
              <Text strong style={{ fontSize: 17, letterSpacing: -0.2, display: 'block' }}>
                {kres?.ad || kres?.isim || 'Kreş'}
              </Text>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>
                Kurum profilini görüntüle
              </Text>
            </div>
          </div>
          <Dropdown menu={userMenu} placement="bottomRight">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                padding: '6px 12px 6px 6px',
                borderRadius: 999,
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = THEME.bg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Avatar icon={<UserOutlined />} style={{ background: THEME.primary }} />
              <Text style={{ fontWeight: 600 }}>{kullanici?.ad || kullanici?.kullaniciAdi || kullanici?.email}</Text>
            </div>
          </Dropdown>
        </Header>
        <Content
          style={{
            margin: 24,
            background: THEME.card,
            padding: 24,
            borderRadius: THEME.radius,
            boxShadow: THEME.shadow,
            border: `1px solid ${THEME.border}`,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
