import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import trTR from 'antd/locale/tr_TR';
import App from './App.jsx';
import { THEME } from './theme';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={trTR}
      theme={{
        token: {
          colorPrimary: THEME.primary,
          colorLink: THEME.primary,
          borderRadius: 8,
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
