import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function Boot() {
  const [App, setApp] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;

    import('./App.jsx')
      .then((module) => {
        if (alive) setApp(() => module.default);
      })
      .catch((err) => {
        console.error('YUMURCAK APP BOOT ERROR:', err);
        if (alive) setError(err);
      });

    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', padding: 32, fontFamily: 'Arial, sans-serif', background: '#fff' }}>
        <h1 style={{ color: '#c00' }}>Yumurcak başlatılamadı</h1>
        <p>Uygulama modülü yüklenirken hata oluştu.</p>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
          {String(error?.stack || error?.message || error)}
        </pre>
        <button onClick={() => window.location.reload()} style={{ padding: '10px 16px', cursor: 'pointer' }}>
          Sayfayı Yenile
        </button>
      </div>
    );
  }

  if (App) return <App />;

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 700 }}>Yumurcak</div>
        <div style={{ marginTop: 8 }}>Panel yükleniyor...</div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Boot />
  </React.StrictMode>
);
