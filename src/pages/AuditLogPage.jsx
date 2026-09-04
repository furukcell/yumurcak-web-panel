import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Table, Select, Input, Tag, Empty, Space } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';

const { Title, Text } = Typography;

const ISLEM_META = {
  ekle: { label: 'Eklendi', color: THEME.green },
  guncelle: { label: 'Güncellendi', color: THEME.blue },
  sil: { label: 'Silindi', color: THEME.red },
};

function formatTarih(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Yönetici, panelde kimin ne zaman ne yaptığını görebilsin diye — bkz.
// utils/auditLog.js -> denetimKaydiYaz (şu an Çocuklar, Öğretmenler,
// Yöneticiler ve Ödemeler modüllerinden kayıt alıyor).
export default function AuditLogPage() {
  const { kullanici, kres } = useAuth();
  const kresId = kres?.id || kullanici?.kresId;

  const [kayitlar, setKayitlar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modulFilter, setModulFilter] = useState('tumu');
  const [islemFilter, setIslemFilter] = useState('tumu');
  const [aramaMetni, setAramaMetni] = useState('');

  useEffect(() => {
    if (!kresId) { setKayitlar([]); setLoading(false); return; }
    const kayitlarQ = query(ref(database, `denetimKayitlari/${kresId}`), orderByChild('tarih'), limitToLast(500));
    const unsub = onValue(
      kayitlarQ,
      (snap) => {
        const data = snap.val();
        const liste = data
          ? Object.entries(data).map(([id, k]) => ({ id, ...k })).sort((a, b) => (b.tarih || 0) - (a.tarih || 0))
          : [];
        setKayitlar(liste);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [kresId]);

  const modulSecenekleri = useMemo(() => {
    const set = new Set(kayitlar.map((k) => k.modul).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [kayitlar]);

  const filtreliKayitlar = kayitlar.filter((k) => {
    if (modulFilter !== 'tumu' && k.modul !== modulFilter) return false;
    if (islemFilter !== 'tumu' && k.islem !== islemFilter) return false;
    if (aramaMetni.trim()) {
      const q = aramaMetni.trim().toLocaleLowerCase('tr');
      const hedef = (k.hedef || '').toLocaleLowerCase('tr');
      const yapan = (k.yapanAd || '').toLocaleLowerCase('tr');
      if (!hedef.includes(q) && !yapan.includes(q)) return false;
    }
    return true;
  });

  const columns = [
    { title: 'Tarih', dataIndex: 'tarih', key: 'tarih', width: 160, render: formatTarih },
    {
      title: 'İşlem',
      dataIndex: 'islem',
      key: 'islem',
      width: 110,
      render: (v) => <Tag color={ISLEM_META[v]?.color || THEME.muted}>{ISLEM_META[v]?.label || v}</Tag>,
    },
    { title: 'Modül', dataIndex: 'modul', key: 'modul', width: 140 },
    { title: 'Kayıt', dataIndex: 'hedef', key: 'hedef', render: (v) => v || <Text type="secondary">-</Text> },
    { title: 'Yapan', dataIndex: 'yapanAd', key: 'yapanAd', width: 170 },
    { title: 'Detay', dataIndex: 'detay', key: 'detay', render: (v) => (v ? <Text type="secondary">{v}</Text> : null) },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 30, height: 30, borderRadius: 9,
                background: `${THEME.muted}1F`, color: THEME.muted,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
              }}
            >
              <HistoryOutlined />
            </div>
            <Title level={3} style={{ margin: 0 }}>Denetim Kaydı</Title>
          </div>
          <Text type="secondary">Panelde yapılan ekleme, güncelleme ve silme işlemlerinin geçmişi · son {kayitlar.length} kayıt</Text>
        </div>
      </div>

      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search
          placeholder="Kayıt adı veya yapan kişiye göre ara"
          allowClear
          style={{ width: 260 }}
          value={aramaMetni}
          onChange={(e) => setAramaMetni(e.target.value)}
        />
        <Select
          value={modulFilter}
          onChange={setModulFilter}
          style={{ width: 180 }}
          options={[{ value: 'tumu', label: 'Tüm modüller' }, ...modulSecenekleri.map((m) => ({ value: m, label: m }))]}
        />
        <Select
          value={islemFilter}
          onChange={setIslemFilter}
          style={{ width: 160 }}
          options={[
            { value: 'tumu', label: 'Tüm işlemler' },
            { value: 'ekle', label: 'Eklendi' },
            { value: 'guncelle', label: 'Güncellendi' },
            { value: 'sil', label: 'Silindi' },
          ]}
        />
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={filtreliKayitlar}
        locale={{ emptyText: <Empty description="Henüz denetim kaydı yok" /> }}
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
}
