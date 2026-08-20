import React from 'react';
import { Typography } from 'antd';
import { useAuth } from '../context/AuthContext';

const { Title, Paragraph } = Typography;

// FAZ 1'de burası özet kartlarla (toplam çocuk, öğretmen, bugünkü rapor
// sayısı vb.) doldurulacak — bkz. docs/web-panel-plan.md, Faz 1.
export default function DashboardPage() {
  const { kullanici } = useAuth();
  return (
    <div>
      <Title level={3}>Hoş geldin, {kullanici?.ad || kullanici?.kullaniciAdi || ''}</Title>
      <Paragraph type="secondary">
        Panel iskeleti kuruldu. Özet kartlar ve istatistikler Faz 1'de eklenecek.
      </Paragraph>
    </div>
  );
}
