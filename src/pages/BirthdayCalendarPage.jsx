import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Button, List, Empty, Spin } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { ref, onValue, get, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { getMonthLabel, shiftMonth } from '../services/monthlyDocuments';

const { Title, Text } = Typography;

// Mobildeki AdminBirthdayCalendarScreen.js'in web karşılığı — elle girilen
// bir belge DEĞİL, cocuklar.dogumTarihi alanından hesaplanan bir rapor.
export default function BirthdayCalendarPage() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId;

  const [monthDate, setMonthDate] = useState(new Date());
  const monthLabel = useMemo(() => getMonthLabel(monthDate), [monthDate]);

  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);
  const [sinifMap, setSinifMap] = useState({});

  useEffect(() => {
    if (!kresId) { setLoading(false); return; }
    const unsub = onValue(ref(database, `kresCocuklari/${kresId}`), async (snap) => {
      const idsData = snap.val();
      if (!idsData) { setChildren([]); setLoading(false); return; }
      const ids = Object.keys(idsData);
      const results = await Promise.all(ids.map((id) => get(ref(database, `cocuklar/${id}`)).then((s) => (s.exists() ? { id, ...s.val() } : null))));
      setChildren(results.filter(Boolean));
      setLoading(false);
    }, () => setLoading(false));

    const sinifUnsub = onValue(query(ref(database, 'siniflar'), orderByChild('kresId'), equalTo(kresId)), (snap) => {
      const data = snap.val() || {};
      const map = {};
      Object.entries(data).forEach(([id, v]) => { map[id] = v?.ad || ''; });
      setSinifMap(map);
    });

    return () => { unsub(); sinifUnsub(); };
  }, [kresId]);

  const birthdays = useMemo(() => {
    const targetMonth = monthDate.getMonth();
    const targetYear = monthDate.getFullYear();
    return children
      .map((child) => {
        const parts = String(child.dogumTarihi || '').split('-');
        if (parts.length !== 3) return null;
        const [yearStr, monthStr, dayStr] = parts;
        const birthMonth = Number(monthStr) - 1;
        if (birthMonth !== targetMonth) return null;
        return { id: child.id, ad: `${child.ad || ''} ${child.soyad || ''}`.trim(), sinifAd: sinifMap[child.sinifId] || '', gun: Number(dayStr), yasOlacak: targetYear - Number(yearStr) };
      })
      .filter(Boolean)
      .sort((a, b) => a.gun - b.gun);
  }, [children, sinifMap, monthDate]);

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>Doğum Günü Takvimi</Title>
      <Text type="secondary">Çocukların kayıtlı doğum tarihinden otomatik hesaplanır</Text>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: THEME.primary, borderRadius: 18, padding: '12px 18px', margin: '16px 0 16px' }}>
        <Button icon={<LeftOutlined />} shape="circle" onClick={() => setMonthDate((prev) => shiftMonth(prev, -1))} />
        <div style={{ textAlign: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>{monthLabel}</Text>
          <div><Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12 }}>{birthdays.length} doğum günü</Text></div>
        </div>
        <Button icon={<RightOutlined />} shape="circle" onClick={() => setMonthDate((prev) => shiftMonth(prev, 1))} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : birthdays.length === 0 ? (
        <Empty description="Bu ay doğum günü olan çocuk yok" />
      ) : (
        <List
          dataSource={birthdays}
          renderItem={(item) => (
            <List.Item style={{ border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: THEME.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Text strong style={{ color: THEME.primary }}>{item.gun}</Text>
                </div>
                <div>
                  <Text strong>🎂 {item.ad}</Text>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>{item.sinifAd} · {item.yasOlacak} yaşına giriyor</Text></div>
                </div>
              </div>
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
