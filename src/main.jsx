import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import trTR from 'antd/locale/tr_TR';
import App from './App.jsx';
import { THEME } from './theme';
import './index.css';

// Tek merkezi tema tanımı — buradaki token'lar Card, Button, Table, Menu,
// Input gibi TÜM antd bileşenlerine otomatik yayılır. Tek tek sayfa
// dosyalarına dokunmadan panel genelinde tutarlı bir görsel kimlik
// sağlar (bkz. PanelLayout.jsx — sidebar/header burada ayrıca elden
// geçirildi).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={trTR}
      theme={{
        token: {
          colorPrimary: THEME.primary,
          colorLink: THEME.primary,
          colorBgLayout: THEME.bg,
          borderRadius: THEME.radiusSm,
          borderRadiusLG: THEME.radius,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        },
        components: {
          Card: {
            borderRadiusLG: THEME.radius,
            boxShadowTertiary: THEME.shadow,
          },
          Button: {
            borderRadius: 10,
            controlHeight: 38,
            fontWeight: 600,
          },
          Menu: {
            itemBorderRadius: 12,
            itemSelectedBg: THEME.primarySoft,
            itemSelectedColor: THEME.primaryDark,
            itemHoverBg: '#F5F2FF',
            itemHeight: 42,
            iconSize: 17,
          },
          Table: {
            borderRadiusLG: THEME.radius,
            headerBg: '#FAF9FF',
          },
          Input: {
            borderRadius: THEME.radiusSm,
            controlHeight: 38,
          },
          Select: {
            borderRadius: THEME.radiusSm,
            controlHeight: 38,
          },
          Tag: {
            borderRadiusSM: 999,
          },
          Drawer: {
            borderRadiusLG: THEME.radius,
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
