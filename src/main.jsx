import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// ConfigProvider (antd tema token'ları) artık burada değil, App.jsx
// içindeki ThemedApp'te — kres'in seçtiği pastel temaya göre canlı
// güncellenmesi gerektiği için AuthContext'e erişimi olan bir yere taşındı.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
