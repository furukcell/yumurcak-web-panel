import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function Boot() {
  const [state, setState] = useState({ loading: true, error: null });

  useEffect(() => {
    let alive = true;

    import('./App.jsx')
      .then(({ default: App }) => {
        if (!alive) return;
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(
          <React.StrictMode>
            <App />
          </React.StrictMode>
        );
      })
      .catch((error) => {
        console.error('YUMURCAK APP BOOT ERROR:', error);
        if (!alive) return;
        setState({ loading: false, error });
      });

    return () => {
      alive = false;
    };
  }, []);

  if (state.error) {
    const error = state.error;
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

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 700 }}>Yumurcak</div>
        <div style={{ marginTop: 8 }}>Panel yükleniyor...</div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Boot />);
