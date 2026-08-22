import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Button, List, Tag, Select, Drawer, message, Empty, Space, Popconfirm } from 'antd';
import { LeftOutlined, RightOutlined, CopyOutlined } from '@ant-design/icons';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { createNotification } from '../utils/notificationCenter';
import {
  getDaysOfMonth, getMonthKey, getMonthLabel, shiftMonth, createInitialValues, countPublished,
  publishMonth, unpublishMonth, copyFromPreviousMonth, fetchActiveMonthValues,
} from '../services/monthlyDocuments';

const { Title, Text } = Typography;
const NODE_PATH = 'yemekListeleri';
const KAYNAK = 'admin_aylik';

function toMealArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  const text = String(value || '').trim();
  return text ? [text] : [];
}
function emptyMealValue() {
  return { kahvalti: [], ogle: [], araOgun: [] };
}
function hasMealContent(value) {
  if (!value) return false;
  return toMealArray(value.kahvalti).length > 0 || toMealArray(value.ogle).length > 0 || toMealArray(value.araOgun).length > 0;
}
function buildMealRecord({ day, value, kresId, monthKey, monthLabel, kaynak, now }) {
  return {
    kresId, sinifId: null, tip: 'aylik', kaynak, ayKey: monthKey, tarih: day.dateKey,
    baslik: `${monthLabel} Yemek Listesi`,
    ogunler: { kahvalti: toMealArray(value.kahvalti), ogle: toMealArray(value.ogle), araOgun: toMealArray(value.araOgun) },
    aktif: true, createdAt: now, updatedAt: now,
  };
}
function mealPreview(value) {
  if (!hasMealContent(value)) return '';
  return [...toMealArray(value?.kahvalti), ...toMealArray(value?.ogle), ...toMealArray(value?.araOgun)].join(' · ');
}

// Mobildeki AdminMonthlyMealScreen.js'in web karşılığı.
export default function MealsPage() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId;
  const adminId = kullanici?.uid || kullanici?.id || null;

  const [monthDate, setMonthDate] = useState(new Date());
  const days = useMemo(() => getDaysOfMonth(monthDate), [monthDate]);
  const monthKey = useMemo(() => getMonthKey(monthDate), [monthDate]);
  const monthLabel = useMemo(() => getMonthLabel(monthDate), [monthDate]);

  const [values, setValues] = useState(() => createInitialValues(days, emptyMealValue));
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [publishedCount, setPublishedCount] = useState(0);

  useEffect(() => {
    if (!kresId) { setPublishedCount(0); return; }
    const q = query(ref(database, NODE_PATH), orderByChild('kresId'), equalTo(kresId));
    const unsub = onValue(q, (snap) => setPublishedCount(countPublished(snap.val(), { kresId, monthKey, kaynak: KAYNAK })), () => setPublishedCount(0));
    return () => unsub();
  }, [kresId, monthKey]);

  useEffect(() => {
    let cancelled = false;
    if (!kresId) return;
    fetchActiveMonthValues({
      nodePath: NODE_PATH, kresId, monthKey, kaynak: KAYNAK,
      valueMapper: (record) => ({ kahvalti: toMealArray(record.ogunler?.kahvalti), ogle: toMealArray(record.ogunler?.ogle), araOgun: toMealArray(record.ogunler?.araOgun) }),
      onError: () => { if (!cancelled) message.error('Yayınlanmış liste okunamadı, form boş görünüyor olabilir.'); },
    }).then((loadedValues) => { if (!cancelled) setValues((prev) => ({ ...prev, ...loadedValues })); });
    return () => { cancelled = true; };
  }, [kresId, monthKey]);

  function changeMonth(direction) {
    const next = shiftMonth(monthDate, direction);
    setMonthDate(next);
    setValues(createInitialValues(getDaysOfMonth(next), emptyMealValue));
    setSelectedDateKey('');
  }

  function updateMealList(dateKey, field, list) {
    setValues((prev) => ({ ...prev, [dateKey]: { ...(prev[dateKey] || emptyMealValue()), [field]: list } }));
  }

  const hasAnyMeal = useMemo(() => Object.values(values).some(hasMealContent), [values]);

  async function handleCopyPreviousMonth() {
    if (!kresId) return;
    setCopying(true);
    try {
      const { values: copiedValues, prevMonthKey, found } = await copyFromPreviousMonth({
        nodePath: NODE_PATH, kresId, kaynak: KAYNAK, currentMonthDate: monthDate, days,
        valueMapper: (prevItem) => ({ kahvalti: toMealArray(prevItem?.ogunler?.kahvalti), ogle: toMealArray(prevItem?.ogunler?.ogle), araOgun: toMealArray(prevItem?.ogunler?.araOgun) }),
      });
      if (!found) { message.warning(`${prevMonthKey} için yayınlanmış bir yemek listesi yok.`); return; }
      setValues((prev) => {
        const next = { ...prev };
        Object.entries(copiedValues).forEach(([dateKey, value]) => { if (value) next[dateKey] = value; });
        return next;
      });
      message.success(`${found} günlük yemek bilgisi geçen aydan kopyalandı.`);
    } catch (error) {
      message.error('Geçen ay kopyalanamadı.');
    } finally {
      setCopying(false);
    }
  }

  async function doPublish() {
    if (!hasAnyMeal) { message.warning('Yayınlamak için en az bir güne yemek bilgisi gir.'); return; }
    setSaving(true);
    try {
      await publishMonth({ nodePath: NODE_PATH, kresId, monthKey, monthLabel, kaynak: KAYNAK, days, values, hasContent: hasMealContent, buildRecord: buildMealRecord });
      await createNotification({ kresId, hedefRoller: ['veli'], baslik: '🍽️ Yemek listesi güncellendi', mesaj: `${monthLabel} yemek listesi yayınlandı.`, tip: 'yemek', routeName: 'ParentMeals', createdBy: adminId || '' });
      message.success(`${monthLabel} yemek listesi yayınlandı`);
    } catch (error) {
      message.error('Aylık yemek listesi yayınlanamadı.');
    } finally {
      setSaving(false);
    }
  }

  async function doUnpublish() {
    setUnpublishing(true);
    try {
      await unpublishMonth({ nodePath: NODE_PATH, kresId, monthKey, kaynak: KAYNAK });
      message.success('Yayından kaldırıldı');
    } catch (error) {
      message.error('Yayından kaldırılamadı.');
    } finally {
      setUnpublishing(false);
    }
  }

  const selectedDay = days.find((day) => day.dateKey === selectedDateKey) || null;
  const selectedValue = values[selectedDateKey] || emptyMealValue();

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>Aylık Yemek Listesi</Title>
      <Text type="secondary">Kurum geneli ay bazlı yemek planı</Text>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: THEME.primary, borderRadius: 18, padding: '12px 18px', margin: '16px 0 12px' }}>
        <Button icon={<LeftOutlined />} shape="circle" onClick={() => changeMonth(-1)} />
        <div style={{ textAlign: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>{monthLabel}</Text>
          <div><Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12 }}>{days.length} günlük plan</Text></div>
        </div>
        <Button icon={<RightOutlined />} shape="circle" onClick={() => changeMonth(1)} />
      </div>

      {publishedCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 12, marginBottom: 12 }}>
          <div>
            <Text strong>✅ {monthLabel} yayında</Text>
            <div><Text type="secondary" style={{ fontSize: 12 }}>Veliler şu an bu ayın listesini görüyor.</Text></div>
          </div>
          <Popconfirm title="Yayından kaldırılsın mı?" okText="Kaldır" cancelText="Vazgeç" okButtonProps={{ danger: true }} onConfirm={doUnpublish}>
            <Button danger size="small" loading={unpublishing}>Yayından Kaldır</Button>
          </Popconfirm>
        </div>
      )}

      <Button icon={<CopyOutlined />} loading={copying} onClick={handleCopyPreviousMonth} style={{ marginBottom: 14 }}>Geçen Ayı Kopyala</Button>

      <List
        dataSource={days}
        renderItem={(day) => {
          const preview = mealPreview(values[day.dateKey]);
          return (
            <List.Item onClick={() => setSelectedDateKey(day.dateKey)} style={{ cursor: 'pointer', border: `1px solid ${THEME.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <Text strong style={{ width: 90 }}>{day.label}</Text>
                {preview ? <Text type="secondary" ellipsis style={{ flex: 1 }}>{preview}</Text> : <Text type="secondary" style={{ color: '#C7C9D6' }}>Boş</Text>}
              </div>
            </List.Item>
          );
        }}
      />

      <Button type="primary" block loading={saving} onClick={doPublish} style={{ marginTop: 16, height: 46 }}>
        {monthLabel} Listesini Yayınla
      </Button>

      <Drawer title={selectedDay?.label || ''} open={!!selectedDay} onClose={() => setSelectedDateKey('')} width={420}>
        <Text strong>Kahvaltı</Text>
        <Select mode="tags" style={{ width: '100%', marginTop: 6, marginBottom: 16 }} value={selectedValue.kahvalti} onChange={(list) => updateMealList(selectedDateKey, 'kahvalti', list)} placeholder="Kahvaltı yemeği ekle, Enter'a bas" open={false} suffixIcon={null} />

        <Text strong>Öğle Yemeği</Text>
        <Select mode="tags" style={{ width: '100%', marginTop: 6, marginBottom: 16 }} value={selectedValue.ogle} onChange={(list) => updateMealList(selectedDateKey, 'ogle', list)} placeholder="Öğle yemeği ekle, Enter'a bas" open={false} suffixIcon={null} />

        <Text strong>Ara Öğün</Text>
        <Select mode="tags" style={{ width: '100%', marginTop: 6, marginBottom: 16 }} value={selectedValue.araOgun} onChange={(list) => updateMealList(selectedDateKey, 'araOgun', list)} placeholder="Ara öğün ekle, Enter'a bas" open={false} suffixIcon={null} />

        {hasMealContent(selectedValue) && (
          <Button danger block onClick={() => setValues((prev) => ({ ...prev, [selectedDateKey]: emptyMealValue() }))}>Bu Günü Temizle</Button>
        )}
      </Drawer>
    </div>
  );
}
