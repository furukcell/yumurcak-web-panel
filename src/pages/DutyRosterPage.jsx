import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Button, List, Drawer, Form, Input, message, Popconfirm, Space } from 'antd';
import { LeftOutlined, RightOutlined, CopyOutlined, PrinterOutlined } from '@ant-design/icons';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { THEME } from '../theme';
import { fetchInstitutionInfo, buildMonthlyDocumentHtml, printHtmlDocument } from '../services/documentPdf';
import {
  getDaysOfMonth, getMonthKey, getMonthLabel, shiftMonth, createInitialValues, countPublished,
  publishMonth, unpublishMonth, copyFromPreviousMonth, fetchActiveMonthValues,
} from '../services/monthlyDocuments';

const { Title, Text } = Typography;
const NODE_PATH = 'nobetCizelgeleri';
const KAYNAK = 'admin_aylik';

function emptyDutyValue() {
  return { personel: '', not: '' };
}
function hasDutyContent(value) {
  if (!value) return false;
  return !!(String(value.personel || '').trim() || String(value.not || '').trim());
}
function buildDutyRecord({ day, value, kresId, monthKey, monthLabel, kaynak, now }) {
  return { kresId, tip: 'aylik', kaynak, ayKey: monthKey, tarih: day.dateKey, baslik: `${monthLabel} Nöbet Çizelgesi`, personel: String(value.personel || '').trim(), not: String(value.not || '').trim(), aktif: true, createdAt: now, updatedAt: now };
}

// Mobildeki AdminMonthlyDutyRosterScreen.js'in web karşılığı.
export default function DutyRosterPage() {
  const { kullanici } = useAuth();
  const { t } = useTranslation();
  const kresId = kullanici?.kresId;

  const [monthDate, setMonthDate] = useState(new Date());
  const days = useMemo(() => getDaysOfMonth(monthDate), [monthDate]);
  const monthKey = useMemo(() => getMonthKey(monthDate), [monthDate]);
  const monthLabel = useMemo(() => getMonthLabel(monthDate), [monthDate]);

  const [values, setValues] = useState(() => createInitialValues(days, emptyDutyValue));
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [publishedCount, setPublishedCount] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!kresId) { setPublishedCount(0); return; }
    const q = query(ref(database, NODE_PATH), orderByChild('kresId'), equalTo(kresId));
    const unsub = onValue(q, (snap) => setPublishedCount(countPublished(snap.val(), { kresId, monthKey, kaynak: KAYNAK })), () => setPublishedCount(0));
    return () => unsub();
  }, [kresId, monthKey]);

  useEffect(() => {
    let cancelled = false;
    if (!kresId) return;
    fetchActiveMonthValues({ nodePath: NODE_PATH, kresId, monthKey, kaynak: KAYNAK, valueMapper: (record) => ({ personel: record.personel || '', not: record.not || '' }) })
      .then((loadedValues) => { if (!cancelled) setValues((prev) => ({ ...prev, ...loadedValues })); });
    return () => { cancelled = true; };
  }, [kresId, monthKey]);

  function changeMonth(direction) {
    const next = shiftMonth(monthDate, direction);
    setMonthDate(next);
    setValues(createInitialValues(getDaysOfMonth(next), emptyDutyValue));
    setSelectedDateKey('');
  }

  const hasAny = useMemo(() => Object.values(values).some(hasDutyContent), [values]);

  async function handleCopyPreviousMonth() {
    if (!kresId) return;
    setCopying(true);
    try {
      const { values: copiedValues, prevMonthKey, found } = await copyFromPreviousMonth({
        nodePath: NODE_PATH, kresId, kaynak: KAYNAK, currentMonthDate: monthDate, days,
        valueMapper: (prevItem) => ({ personel: prevItem?.personel || '', not: prevItem?.not || '' }),
      });
      if (!found) { message.warning(t('dutyRoster.noPrevious', { month: prevMonthKey })); return; }
      setValues((prev) => { const next = { ...prev }; Object.entries(copiedValues).forEach(([k, v]) => { if (v) next[k] = v; }); return next; });
      message.success(t('dutyRoster.copied', { count: found }));
    } catch {
      message.error(t('dutyRoster.copyError'));
    } finally {
      setCopying(false);
    }
  }

  async function doPublish() {
    if (!hasAny) { message.warning(t('dutyRoster.publishRequired')); return; }
    setSaving(true);
    try {
      await publishMonth({ nodePath: NODE_PATH, kresId, monthKey, monthLabel, kaynak: KAYNAK, days, values, hasContent: hasDutyContent, buildRecord: buildDutyRecord });
      message.success(t('dutyRoster.published', { month: monthLabel }));
    } catch {
      message.error(t('dutyRoster.publishError'));
    } finally {
      setSaving(false);
    }
  }

  async function doUnpublish() {
    setUnpublishing(true);
    try {
      await unpublishMonth({ nodePath: NODE_PATH, kresId, monthKey, kaynak: KAYNAK });
      message.success(t('dutyRoster.unpublished'));
    } catch {
      message.error(t('dutyRoster.unpublishError'));
    } finally {
      setUnpublishing(false);
    }
  }

  async function doPrint() {
    setPrinting(true);
    try {
      const kres = await fetchInstitutionInfo(kresId);
      const records = days.map((day) => ({ tarih: day.dateKey, ...values[day.dateKey] })).filter((r) => hasDutyContent(r));
      const html = buildMonthlyDocumentHtml({ docType: 'nobet', kres, monthLabel, records });
      printHtmlDocument(html);
    } catch {
      message.error(t('dutyRoster.printError'));
    } finally {
      setPrinting(false);
    }
  }

  const selectedDay = days.find((day) => day.dateKey === selectedDateKey) || null;

  const openDay = (dateKey) => {
    setSelectedDateKey(dateKey);
    form.setFieldsValue(values[dateKey] || emptyDutyValue());
  };

  const saveDay = () => {
    const v = form.getFieldsValue();
    setValues((prev) => ({ ...prev, [selectedDateKey]: v }));
    setSelectedDateKey('');
  };

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>{t('dutyRoster.title')}</Title>
      <Text type="secondary">{t('dutyRoster.subtitle')}</Text>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: THEME.primary, borderRadius: 18, padding: '12px 18px', margin: '16px 0 12px' }}>
        <Button icon={<LeftOutlined />} shape="circle" onClick={() => changeMonth(-1)} />
        <div style={{ textAlign: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>{monthLabel}</Text>
          <div><Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12 }}>{t('dutyRoster.dayPlan', { count: days.length })}</Text></div>
        </div>
        <Button icon={<RightOutlined />} shape="circle" onClick={() => changeMonth(1)} />
      </div>

      {publishedCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 12, marginBottom: 12 }}>
          <Text strong>✅ {monthLabel} yayında</Text>
          <Popconfirm title={t('dutyRoster.unpublishConfirm')} okText={t('dutyRoster.remove')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={doUnpublish}>
            <Button danger size="small" loading={unpublishing}>{t('dutyRoster.unpublish')}</Button>
          </Popconfirm>
        </div>
      )}

      <Space style={{ marginBottom: 14 }}>
        <Button icon={<CopyOutlined />} loading={copying} onClick={handleCopyPreviousMonth}>{t('dutyRoster.copyPrevious')}</Button>
        <Button icon={<PrinterOutlined />} loading={printing} onClick={doPrint}>{t('common.printPdf')}</Button>
      </Space>

      <List
        dataSource={days}
        renderItem={(day) => {
          const v = values[day.dateKey] || emptyDutyValue();
          return (
            <List.Item onClick={() => openDay(day.dateKey)} style={{ cursor: 'pointer', border: `1px solid ${THEME.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <Text strong style={{ width: 90 }}>{day.label}</Text>
                {v.personel ? <Text type="secondary">{v.personel}{v.not ? ` · ${v.not}` : ''}</Text> : <Text type="secondary" style={{ color: '#C7C9D6' }}>{t('common.empty')}</Text>}
              </div>
            </List.Item>
          );
        }}
      />

      <Button type="primary" block loading={saving} onClick={doPublish} style={{ marginTop: 16, height: 46 }}>
        {t('dutyRoster.publish', { month: monthLabel })}
      </Button>

      <Drawer title={selectedDay?.label || ''} open={!!selectedDay} onClose={() => setSelectedDateKey('')} width={380} extra={<Button type="primary" onClick={saveDay}>{t('common.save')}</Button>}>
        <Form form={form} layout="vertical">
          <Form.Item name="personel" label={t('dutyRoster.personnelLabel')}>
            <Input placeholder={t('dutyRoster.personnelPlaceholder')} />
          </Form.Item>
          <Form.Item name="not" label={t('dutyRoster.noteLabel')}>
            <Input.TextArea rows={3} placeholder={t('dutyRoster.notePlaceholder')} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
