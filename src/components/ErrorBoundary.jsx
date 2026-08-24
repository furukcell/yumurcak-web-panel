import React from 'react';
import { Result, Button } from 'antd';

// Tek bir sayfada beklenmeyen bir hata (ör. null erişimi) oluşursa tüm
// paneli beyaz ekrana düşürmemesi için route seviyesinde kullanılan
// hata sınırı. Sidebar/PanelLayout ayakta kalır, sadece içerik alanı
// bu fallback'i gösterir.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hataVar: false };
  }

  static getDerivedStateFromError() {
    return { hataVar: true };
  }

  componentDidCatch(error, info) {
    console.error('Sayfa hatası yakalandı:', error, info);
  }

  componentDidUpdate(prevProps) {
    // Route değişince (farklı bir sayfaya geçilince) hata durumunu sıfırla,
    // aksi halde başka bir sayfaya geçince de aynı fallback görünmeye devam eder.
    if (prevProps.resetKey !== this.props.resetKey && this.state.hataVar) {
      this.setState({ hataVar: false });
    }
  }

  render() {
    if (this.state.hataVar) {
      return (
        <Result
          status="error"
          title="Bu sayfada beklenmeyen bir hata oluştu"
          subTitle="Sayfayı yenilemeyi deneyebilir ya da başka bir menüye geçebilirsin."
          extra={
            <Button type="primary" onClick={() => window.location.reload()}>
              Sayfayı Yenile
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
