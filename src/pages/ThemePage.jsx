import React, { useEffect, useState } from 'react';
import { Typography, Button, Switch, Row, Col, Tag, message, Spin } from 'antd';
import { ref, get, update } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { THEME_LIST, DEFAULT_THEME_ID } from '../theme/themes';

const { Title, Text } = Typography;

// Mobildeki AdminThemeScreen.js'in web karşılığı.
export default function ThemePage() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId || 'kres001';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedThemeId, setSelectedThemeId] = useState(DEFAULT_THEME_ID);
  const [patternEnabled, setPatternEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await get(ref(database, `kresler/${kresId}`));
        const data = snap.val() || {};
        setSelectedThemeId(data.temaId || DEFAULT_THEME_ID);
        setPatternEnabled(data.temaAyarlari?.patternEnabled !== false);
      } catch {
        message.error('Tema bilgisi okunamadı.');
      } finally {
        setLoading(false);
      }
    })();
  }, [kresId]);

  async function handleSave() {
    setSaving(true);
    try {
      await update(ref(database, `kresler/${kresId}`), {
        temaId: selectedThemeId,
        temaAyarlari: { temaId: selectedThemeId, patternEnabled, updatedAt: Date.now() },
      });
      message.success('Kreş teması güncellendi');
    } catch {
      message.error('Tema kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>Tema Ayarları</Title>
      <Text type="secondary">Bu seçim aynı kreşe bağlı veli ve öğretmen ekranlarına uygulanır.</Text>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: `1px solid ${THEME.border}`, borderRadius: 16, padding: 16, margin: '16px 0 20px' }}>
        <div>
          <Text strong>Arka plan figürleri</Text>
          <div><Text type="secondary" style={{ fontSize: 12 }}>Hayvan ve şekil desenleri ana ekranda hafif görünür.</Text></div>
        </div>
        <Switch checked={patternEnabled} onChange={setPatternEnabled} />
      </div>

      <Row gutter={[12, 12]}>
        {THEME_LIST.map((item) => {
          const active = selectedThemeId === item.id;
          return (
            <Col xs={12} md={8} lg={6} key={item.id}>
              <div
                onClick={() => setSelectedThemeId(item.id)}
                style={{ cursor: 'pointer', background: item.card, borderRadius: 20, padding: 12, border: `${active ? 2 : 1}px solid ${active ? item.primary : item.border}`, position: 'relative', minHeight: 165 }}
              >
                {active && <Tag color={item.primary} style={{ position: 'absolute', right: 10, top: 10, border: 'none', color: '#fff', background: item.primary }}>Seçili</Tag>}
                <div style={{ height: 78, borderRadius: 16, background: item.primary, padding: 10, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 5 }}>
                  <div style={{ height: 26, borderRadius: 10, background: 'rgba(255,255,255,0.85)' }} />
                  <div style={{ display: 'flex', gap: 5 }}>
                    <div style={{ flex: 1, height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.45)' }} />
                    <div style={{ flex: 1, height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.45)' }} />
                    <div style={{ flex: 1, height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.45)' }} />
                  </div>
                </div>
                <div style={{ marginTop: 10, fontWeight: 900, fontSize: 14, color: item.text }}>{item.name}</div>
                <div style={{ marginTop: 3, fontSize: 11, fontWeight: 600, color: item.muted }}>{item.subtitle}</div>
              </div>
            </Col>
          );
        })}
      </Row>

      <Button type="primary" block loading={saving} onClick={handleSave} style={{ height: 46, marginTop: 20 }}>Bu Temayı Kullan</Button>
    </div>
  );
}
