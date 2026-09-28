import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Button, List, Tag, Select, Drawer, message, Empty, Space, Popconfirm } from 'antd';
import { LeftOutlined, RightOutlined, CopyOutlined, PrinterOutlined } from '@ant-design/icons';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { THEME } from '../theme';
import { createNotification } from '../utils/notificationCenter';
import { fetchInstitutionInfo, buildMonthlyDocumentHtml, printHtmlDocument } from '../services/documentPdf';
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
  const { t } = useTranslation();
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
  const [printing, setPrinting] = useState(false);

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
      onError: () => { if (!cancelled) message.error(t('meals.loadError')); },
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
      if (!found) { message.warning(t('meals.noPrevious', { month: prevMonthKey })); return; }
      setValues((prev) => {
        const next = { ...prev };
        Object.entries(copiedValues).forEach(([dateKey, value]) => { if (value) next[dateKey] = value; });
        return next;
      });
      message.success(t('meals.copied', { count: found }));
    } catch (error) {
      message.error(t('meals.copyError'));
    } finally {
      setCopying(false);
    }
  }

  async function doPublish() {
    if (!hasAnyMeal) { message.warning(t('meals.publishRequired')); return; }
    setSaving(true);
    try {
      await publishMonth({ nodePath: NODE_PATH, kresId, monthKey, monthLabel, kaynak: KAYNAK, days, values, hasContent: hasMealContent, buildRecord: buildMealRecord });
      await createNotification({ kresId, hedefRoller: ['veli'], baslik: t('meals.notificationTitle'), mesaj: t('meals.notificationMessage', { month: monthLabel }), tip: 'yemek', routeName: 'ParentMeals', createdBy: adminId || '' });
      message.success(t('meals.published', { month: monthLabel }));
    } catch (error) {
      message.error(t('meals.publishError'));
    } finally {
      setSaving(false);
    }
  }

  async function doUnpublish() {
    setUnpublishing(true);
    try {
      await unpublishMonth({ nodePath: NODE_PATH, kresId, monthKey, kaynak: KAYNAK });
      message.success(t('meals.unpublished'));
    } catch (error) {
      message.error(t('meals.unpublishError'));
    } finally {
      setUnpublishing(false);
    }
  }

  async function doPrint() {
    setPrinting(true);
    try {
      const kres = await fetchInstitutionInfo(kresId);
      const records = days
        .map((day) => ({ tarih: day.dateKey, ogunler: values[day.dateKey] }))
        .filter((r) => hasMealContent(r.ogunler));
      const html = buildMonthlyDocumentHtml({ docType: 'yemek', kres, monthLabel, records });
      printHtmlDocument(html);
    } catch (error) {
      message.error(t('meals.printError'));
    } finally {
      setPrinting(false);
    }
  }

  const selectedDay = days.find((day) => day.dateKey === selectedDateKey) || null;
  const selectedValue = values[selectedDateKey] || emptyMealValue();

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>{t('meals.title')}</Title>
      <Text type="secondary">{t('meals.subtitle')}</Text>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: THEME.primary, borderRadius: 18, padding: '12px 18px', margin: '16px 0 12px' }}>
        <Button icon={<LeftOutlined />} shape="circle" onClick={() => changeMonth(-1)} />
        <div style={{ textAlign: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>{monthLabel}</Text>
          <div><Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12 }}>{t('meals.dayPlan', { count: days.length })}</Text></div>
        </div>
        <Button icon={<RightOutlined />} shape="circle" onClick={() => changeMonth(1)} />
      </div>

      {publishedCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 12, marginBottom: 12 }}>
          <div>
            <Text strong>✅ {monthLabel} yayında</Text>
            <div><Text type="secondary" style={{ fontSize: 12 }}>Veliler şu an bu ayın listesini görüyor.</Text></div>
          </div>
          <Popconfirm title={t('meals.unpublishConfirm')} okText={t('meals.remove')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={doUnpublish}>
            <Button danger size="small" loading={unpublishing}>{t('meals.unpublish')}</Button>
          </Popconfirm>
        </div>
      )}

      <Space style={{ marginBottom: 14 }}>
        <Button icon={<CopyOutlined />} loading={copying} onClick={handleCopyPreviousMonth}>{t('meals.copyPrevious')}</Button>
        <Button icon={<PrinterOutlined />} loading={printing} onClick={doPrint}>{t('common.printPdf')}</Button>
      </Space>

      <List
        dataSource={days}
        renderItem={(day) => {
          const preview = mealPreview(values[day.dateKey]);
          return (
            <List.Item onClick={() => setSelectedDateKey(day.dateKey)} style={{ cursor: 'pointer', border: `1px solid ${THEME.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <Text strong style={{ width: 90 }}>{day.label}</Text>
                {preview ? <Text type="secondary" ellipsis style={{ flex: 1 }}>{preview}</Text> : <Text type="secondary" style={{ color: '#C7C9D6' }}>{t('common.empty')}</Text>}
              </div>
            </List.Item>
          );
        }}
      />

      <Button type="primary" block loading={saving} onClick={doPublish} style={{ marginTop: 16, height: 46 }}>
        {t('meals.publish', { month: monthLabel })}
      </Button>

      <Drawer title={selectedDay?.label || ''} open={!!selectedDay} onClose={() => setSelectedDateKey('')} width={420}>
        <Text strong>{t('meals.breakfast')}</Text>
        <Select mode="tags" style={{ width: '100%', marginTop: 6, marginBottom: 16 }} value={selectedValue.kahvalti} onChange={(list) => updateMealList(selectedDateKey, 'kahvalti', list)} placeholder={t('meals.breakfastPlaceholder')} open={false} suffixIcon={null} />

        <Text strong>{t('meals.lunch')}</Text>
        <Select mode="tags" style={{ width: '100%', marginTop: 6, marginBottom: 16 }} value={selectedValue.ogle} onChange={(list) => updateMealList(selectedDateKey, 'ogle', list)} placeholder={t('meals.lunchPlaceholder')} open={false} suffixIcon={null} />

        <Text strong>{t('meals.snack')}</Text>
        <Select mode="tags" style={{ width: '100%', marginTop: 6, marginBottom: 16 }} value={selectedValue.araOgun} onChange={(list) => updateMealList(selectedDateKey, 'araOgun', list)} placeholder={t('meals.snackPlaceholder')} open={false} suffixIcon={null} />

        {hasMealContent(selectedValue) && (
          <Button danger block onClick={() => setValues((prev) => ({ ...prev, [selectedDateKey]: emptyMealValue() }))}>{t('meals.clearDay')}</Button>
        )}
      </Drawer>
    </div>
  );
}
