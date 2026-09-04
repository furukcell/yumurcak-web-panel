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
  PictureOutlined,
  RocketOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { useUnreadMessagesCount } from '../utils/messageHelpers';
import NotificationToasts from './NotificationToasts';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

// Faz 0-1: Dashboard + İstatistik, Faz 2: Çekirdek Yönetim (CRUD),
// Faz 3: İletişim eklendi (bkz. docs/web-panel-plan.md).
// FAZ X: Sidebar 5 mantıksal bölüme ayrıldı (Genel / Kurum Yönetimi /
// İletişim / Günlük Operasyon / Ayarlar) — 21 maddelik tek düz liste
// yerine göz taraması kolay gruplu yapı (bkz. sidebar-mockup.html).
function groupLabel(text) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#B3AFCB' }}>
      {text}
    </span>
  );
}

// Her menü ikonunu kendi renginde küçük bir rozet içine alır — dashboard
// özet kartlarındaki (renkli soft-circle) mantığın sidebar karşılığı.
// Amaç: mockup'taki canlı/renkli ikon hissini korumak; antd'nin varsayılan
// tek-renk (gri/mor) menü ikon davranışını burada bilinçli olarak eziyoruz.
function coloredIcon(Icon, color) {
  return (
    <span
      style={{
        width: 24,
        height: 24,
        borderRadius: 7,
        background: `${color}1F`,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        flexShrink: 0,
      }}
    >
      <Icon />
    </span>
  );
}

function buildMenuItems(unreadCount) {
  return [
    {
      key: 'grp-genel',
      type: 'group',
      label: groupLabel('Genel'),
      children: [
        { key: '/', icon: coloredIcon(DashboardOutlined, THEME.primary), label: 'Dashboard' },
        { key: '/istatistik', icon: coloredIcon(BarChartOutlined, THEME.blue), label: 'İstatistik' },
      ],
    },
    {
      key: 'grp-kurum',
      type: 'group',
      label: groupLabel('Kurum Yönetimi'),
      children: [
        { key: '/siniflar', icon: coloredIcon(ReadOutlined, THEME.blue), label: 'Sınıflar' },
        { key: '/toplu-kurulum', icon: coloredIcon(RocketOutlined, THEME.green), label: 'Toplu Kurulum' },
        { key: '/cocuklar', icon: coloredIcon(SmileOutlined, THEME.orange), label: 'Çocuklar' },
        { key: '/yoneticiler', icon: coloredIcon(CrownOutlined, THEME.gold), label: 'Yöneticiler' },
        { key: '/ogretmenler', icon: coloredIcon(TeamOutlined, THEME.primary), label: 'Öğretmenler' },
        { key: '/veliler', icon: coloredIcon(ContactsOutlined, THEME.green), label: 'Veliler' },
      ],
    },
    {
      key: 'grp-iletisim',
      type: 'group',
      label: groupLabel('İletişim'),
      children: [
        { key: '/duyurular', icon: coloredIcon(NotificationOutlined, THEME.red), label: 'Duyurular' },
        { key: '/etkinlikler', icon: coloredIcon(CalendarOutlined, THEME.teal), label: 'Etkinlikler' },
        { key: '/galeri', icon: coloredIcon(PictureOutlined, THEME.orange), label: 'Galeri' },
        { key: '/anketler', icon: coloredIcon(BarsOutlined, THEME.purple), label: 'Anketler' },
        {
          key: '/mesajlar',
          icon: coloredIcon(MessageOutlined, THEME.blue),
          label: unreadCount > 0 ? <span>Mesajlar <Badge count={unreadCount} size="small" style={{ marginLeft: 4 }} /></span> : 'Mesajlar',
        },
      ],
    },
    {
      key: 'grp-operasyon',
      type: 'group',
      label: groupLabel('Günlük Operasyon'),
      children: [
        { key: '/yemek-listesi', icon: coloredIcon(CoffeeOutlined, THEME.orange), label: 'Yemek Listesi' },
        { key: '/ders-programi', icon: coloredIcon(ScheduleOutlined, THEME.teal), label: 'Ders Programı' },
        { key: '/nobet-cizelgesi', icon: coloredIcon(SolutionOutlined, THEME.gold), label: 'Nöbet Çizelgesi' },
        { key: '/personel-gorevleri', icon: coloredIcon(SolutionOutlined, THEME.primary), label: 'Personel Görevleri' },
        { key: '/servis', icon: coloredIcon(CarOutlined, THEME.blue), label: 'Servis' },
        { key: '/dogum-gunleri', icon: coloredIcon(GiftOutlined, THEME.gold), label: 'Doğum Günleri' },
        { key: '/odemeler', icon: coloredIcon(WalletOutlined, THEME.green), label: 'Ödemeler' },
      ],
    },
    {
      key: 'grp-ayarlar',
      type: 'group',
      label: groupLabel('Ayarlar'),
      children: [
        { key: '/ayarlar/kurum', icon: coloredIcon(SettingOutlined, THEME.muted), label: 'Kurum Bilgileri' },
        { key: '/ayarlar/tema', icon: coloredIcon(BgColorsOutlined, THEME.purple), label: 'Tema Ayarları' },
        { key: '/ayarlar/abonelik', icon: coloredIcon(CrownOutlined, THEME.gold), label: 'Abonelik' },
        { key: '/ayarlar/kurum-zili', icon: coloredIcon(BellOutlined, THEME.red), label: 'Kurum Zili' },
        { key: '/yasal-belgeler', icon: coloredIcon(FileProtectOutlined, THEME.blue), label: 'Yasal Belgeler' },
        { key: '/denetim-kaydi', icon: coloredIcon(HistoryOutlined, THEME.muted), label: 'Denetim Kaydı' },
      ],
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
      <NotificationToasts kullanici={kullanici} />
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        width={236}
        style={{
          background: 'linear-gradient(180deg, #FDFCFF 0%, #F7F3FF 100%)',
          borderRight: `1px solid ${THEME.border}`,
          display: 'flex',
          flexDirection: 'column',
        }}
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
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 10px 12px' }}>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ background: 'transparent', border: 'none' }}
          />
        </div>
        <div style={{ padding: 12, borderTop: `1px solid ${THEME.border}`, flexShrink: 0 }}>
          <Dropdown menu={userMenu} placement="topLeft">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                padding: collapsed ? '8px 0' : '8px 10px',
                borderRadius: 12,
                justifyContent: collapsed ? 'center' : 'flex-start',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F1ECFF')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Avatar size={32} icon={<UserOutlined />} style={{ background: THEME.primary, flexShrink: 0 }} />
              {!collapsed && (
                <>
                  <div style={{ lineHeight: 1.2, minWidth: 0, flex: 1 }}>
                    <Text strong style={{ fontSize: 12.5, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {kullanici?.ad || kullanici?.kullaniciAdi || kullanici?.email || 'Kullanıcı'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {kullanici?.rol === 'yonetici' ? 'Yönetici' : (kullanici?.rol || 'Yönetici')}
                    </Text>
                  </div>
                  <LogoutOutlined style={{ color: '#C7C4DA', fontSize: 14, flexShrink: 0 }} />
                </>
              )}
            </div>
          </Dropdown>
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
