import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Button, List, Tag, Drawer, Input, Select, message, Popconfirm, Space, Empty } from 'antd';
import { LeftOutlined, RightOutlined, CopyOutlined, PlusOutlined, DeleteOutlined, PrinterOutlined } from '@ant-design/icons';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { generateId } from '../utils/crudHelpers';
import { createNotification } from '../utils/notificationCenter';
import { fetchInstitutionInfo, buildMonthlyDocumentHtml, printHtmlDocument } from '../services/documentPdf';
import {
  getDaysOfMonth, getMonthKey, getMonthLabel, shiftMonth, createInitialValues, countPublished,
  publishMonth, unpublishMonth, copyFromPreviousMonth, fetchActiveMonthValues, forClass,
} from '../services/monthlyDocuments';

const { Title, Text } = Typography;
const NODE_PATH = 'dersProgramlari';
const KAYNAK = 'admin_aylik';

const KATEGORILER = [
  { key: 'sanat', label: 'Sanat', emoji: '🎨' },
  { key: 'muzik', label: 'Müzik', emoji: '🎵' },
  { key: 'hareket', label: 'Hareket', emoji: '🏃' },
  { key: 'fen', label: 'Fen', emoji: '🧪' },
  { key: 'dil', label: 'Dil', emoji: '📖' },
  { key: 'drama', label: 'Drama', emoji: '🎭' },
  { key: 'matematik', label: 'Matematik', emoji: '🔢' },
  { key: 'diger', label: 'Diğer', emoji: '✨' },
];

function emptyActivityItem() {
  return { id: generateId(), etkinlik: '', aciklama: '', kategori: '', baslangicSaati: '', bitisSaati: '' };
}
function hasActivityItemContent(item) {
  return !!(String(item?.etkinlik || '').trim() || String(item?.aciklama || '').trim());
}
function emptyScheduleValue() {
  return { etkinlikler: [] };
}
function hasScheduleContent(value) {
  if (!value) return false;
  return (Array.isArray(value.etkinlikler) ? value.etkinlikler : []).some(hasActivityItemContent);
}
function buildScheduleRecord({ day, value, kresId, monthKey, monthLabel, kaynak, now, sinifId }) {
  const list = Array.isArray(value.etkinlikler) ? value.etkinlikler : [];
  return {
    kresId, sinifId: sinifId || null, tip: 'aylik', kaynak, ayKey: monthKey, tarih: day.dateKey,
    baslik: `${monthLabel} Ders Programı`,
    etkinlikler: list.filter(hasActivityItemContent).map((item) => ({
      etkinlik: String(item.etkinlik || '').trim(), aciklama: String(item.aciklama || '').trim(),
      kategori: item.kategori || null, baslangicSaati: item.baslangicSaati || null, bitisSaati: item.bitisSaati || null,
    })),
    aktif: true, createdAt: now, updatedAt: now,
  };
}
function schedulePreview(value) {
  if (!hasScheduleContent(value)) return '';
  return (value.etkinlikler || []).map((item) => item?.etkinlik).filter(Boolean).join(' · ');
}

// Mobildeki LessonScheduleListScreen.js + AdminMonthlyScheduleScreen.js'in web karşılığı.
export default function SchedulePage() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId;

  const [siniflar, setSiniflar] = useState([]);
  const [programData, setProgramData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedSinif, setSelectedSinif] = useState(null);

  useEffect(() => {
    if (!kresId) { setSiniflar([]); setLoading(false); return; }
    let sinifData = {}, program = {}, sinifLoaded = false, programLoaded = false;

    function build() {
      if (!sinifLoaded || !programLoaded) return;
      const currentMonthKey = getMonthKey(new Date());
      const liste = Object.entries(sinifData).map(([id, s]) => ({
        id, ad: s?.ad || 'İsimsiz Sınıf', yasGrubu: s?.yasGrubu || null,
        programVarMi: Object.values(program).some((item) => item?.sinifId === id && item?.ayKey === currentMonthKey && item?.kaynak === KAYNAK && item?.aktif !== false),
      }));
      setSiniflar(liste);
      setProgramData(program);
      setLoading(false);
    }

    const sinifUnsub = onValue(query(ref(database, 'siniflar'), orderByChild('kresId'), equalTo(kresId)), (snap) => { sinifData = snap.val() || {}; sinifLoaded = true; build(); }, () => { sinifLoaded = true; build(); });
    const programUnsub = onValue(query(ref(database, NODE_PATH), orderByChild('kresId'), equalTo(kresId)), (snap) => { program = snap.val() || {}; programLoaded = true; build(); }, () => { programLoaded = true; build(); });

    return () => { sinifUnsub(); programUnsub(); };
  }, [kresId]);

  if (selectedSinif) {
    return <ClassScheduleEditor sinif={selectedSinif} kresId={kresId} onBack={() => setSelectedSinif(null)} />;
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>Ders Programı</Title>
      <Text type="secondary">Sınıf bazlı, ay + gün bazlı program</Text>

      <List
        style={{ marginTop: 16 }}
        loading={loading}
        dataSource={siniflar}
        locale={{ emptyText: <Empty description="Henüz sınıf eklenmemiş" /> }}
        renderItem={(item) => (
          <List.Item onClick={() => setSelectedSinif(item)} style={{ cursor: 'pointer', border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div>
                <Text strong>🏫 {item.ad}</Text>
                {item.yasGrubu && <div><Text type="secondary" style={{ fontSize: 12 }}>{item.yasGrubu}</Text></div>}
              </div>
              <Tag color={item.programVarMi ? 'green' : 'orange'}>{item.programVarMi ? 'Program Var' : 'Program Yok'}</Tag>
            </div>
          </List.Item>
        )}
      />
    </div>
  );
}

function ClassScheduleEditor({ sinif, kresId, onBack }) {
  const { kullanici } = useAuth();
  const adminId = kullanici?.uid || kullanici?.id || null;
  const sinifId = sinif.id;

  const [monthDate, setMonthDate] = useState(new Date());
  const days = useMemo(() => getDaysOfMonth(monthDate), [monthDate]);
  const monthKey = useMemo(() => getMonthKey(monthDate), [monthDate]);
  const monthLabel = useMemo(() => getMonthLabel(monthDate), [monthDate]);

  const [values, setValues] = useState(() => createInitialValues(days, emptyScheduleValue));
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [publishedCount, setPublishedCount] = useState(0);

  useEffect(() => {
    if (!kresId) { setPublishedCount(0); return; }
    const q = query(ref(database, NODE_PATH), orderByChild('kresId'), equalTo(kresId));
    const unsub = onValue(q, (snap) => setPublishedCount(countPublished(snap.val(), { kresId, monthKey, kaynak: KAYNAK, matchExtra: forClass(sinifId) })), () => setPublishedCount(0));
    return () => unsub();
  }, [kresId, monthKey, sinifId]);

  useEffect(() => {
    let cancelled = false;
    if (!kresId) return;
    fetchActiveMonthValues({
      nodePath: NODE_PATH, kresId, monthKey, kaynak: KAYNAK, matchExtra: forClass(sinifId),
      valueMapper: (record) => ({ etkinlikler: (record.etkinlikler || []).map((item) => ({ id: generateId(), ...item })) }),
    }).then((loadedValues) => { if (!cancelled) setValues((prev) => ({ ...prev, ...loadedValues })); });
    return () => { cancelled = true; };
  }, [kresId, monthKey, sinifId]);

  function changeMonth(direction) {
    const next = shiftMonth(monthDate, direction);
    setMonthDate(next);
    setValues(createInitialValues(getDaysOfMonth(next), emptyScheduleValue));
    setSelectedDateKey('');
  }

  const hasAny = useMemo(() => Object.values(values).some(hasScheduleContent), [values]);

  function updateDayItems(dateKey, items) {
    setValues((prev) => ({ ...prev, [dateKey]: { etkinlikler: items } }));
  }

  async function handleCopyPreviousMonth() {
    if (!kresId) return;
    setCopying(true);
    try {
      const { values: copiedValues, prevMonthKey, found } = await copyFromPreviousMonth({
        nodePath: NODE_PATH, kresId, kaynak: KAYNAK, currentMonthDate: monthDate, days, matchExtra: forClass(sinifId),
        valueMapper: (prevItem) => ({ etkinlikler: (prevItem?.etkinlikler || []).map((item) => ({ id: generateId(), ...item })) }),
      });
      if (!found) { message.warning(`${prevMonthKey} için yayınlanmış program yok.`); return; }
      setValues((prev) => { const next = { ...prev }; Object.entries(copiedValues).forEach(([k, v]) => { if (v) next[k] = v; }); return next; });
      message.success(`${found} günlük program geçen aydan kopyalandı.`);
    } catch {
      message.error('Geçen ay kopyalanamadı.');
    } finally {
      setCopying(false);
    }
  }

  async function doPublish() {
    if (!hasAny) { message.warning('Yayınlamak için en az bir güne etkinlik gir.'); return; }
    setSaving(true);
    try {
      await publishMonth({
        nodePath: NODE_PATH, kresId, monthKey, monthLabel, kaynak: KAYNAK, days, values, hasContent: hasScheduleContent,
        buildRecord: (args) => buildScheduleRecord({ ...args, sinifId }), matchExtra: forClass(sinifId),
      });
      await createNotification({ kresId, hedefRoller: ['veli'], baslik: '📚 Ders programı güncellendi', mesaj: `${sinif.ad} sınıfı ${monthLabel} programı yayınlandı.`, tip: 'ders_programi', routeName: 'ParentSchedule', createdBy: adminId || '' });
      message.success(`${monthLabel} programı yayınlandı`);
    } catch {
      message.error('Program yayınlanamadı.');
    } finally {
      setSaving(false);
    }
  }

  async function doUnpublish() {
    setUnpublishing(true);
    try {
      await unpublishMonth({ nodePath: NODE_PATH, kresId, monthKey, kaynak: KAYNAK, matchExtra: forClass(sinifId) });
      message.success('Yayından kaldırıldı');
    } catch {
      message.error('Yayından kaldırılamadı.');
    } finally {
      setUnpublishing(false);
    }
  }

  const selectedDay = days.find((day) => day.dateKey === selectedDateKey) || null;
  const selectedItems = values[selectedDateKey]?.etkinlikler || [];

  async function doPrint() {
    setPrinting(true);
    try {
      const kres = await fetchInstitutionInfo(kresId);
      const records = days.map((day) => ({ tarih: day.dateKey, etkinlikler: values[day.dateKey]?.etkinlikler || [] })).filter((r) => hasScheduleContent({ etkinlikler: r.etkinlikler }));
      const html = buildMonthlyDocumentHtml({ docType: 'ders', kres, monthLabel, sinifAd: sinif.ad, records });
      printHtmlDocument(html);
    } catch {
      message.error('Yazdırılacak belge oluşturulamadı.');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div>
      <Button onClick={onBack} style={{ marginBottom: 12 }}>‹ Sınıflara Dön</Button>
      <Title level={3} style={{ marginBottom: 4 }}>{sinif.ad} — Ders Programı</Title>
      <Text type="secondary">{sinif.yasGrubu}</Text>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: THEME.primary, borderRadius: 18, padding: '12px 18px', margin: '16px 0 12px' }}>
        <Button icon={<LeftOutlined />} shape="circle" onClick={() => changeMonth(-1)} />
        <Text style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>{monthLabel}</Text>
        <Button icon={<RightOutlined />} shape="circle" onClick={() => changeMonth(1)} />
      </div>

      {publishedCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 12, marginBottom: 12 }}>
          <Text strong>✅ {monthLabel} yayında</Text>
          <Popconfirm title="Yayından kaldırılsın mı?" okText="Kaldır" cancelText="Vazgeç" okButtonProps={{ danger: true }} onConfirm={doUnpublish}>
            <Button danger size="small" loading={unpublishing}>Yayından Kaldır</Button>
          </Popconfirm>
        </div>
      )}

      <Space style={{ marginBottom: 14 }}>
        <Button icon={<CopyOutlined />} loading={copying} onClick={handleCopyPreviousMonth}>Geçen Ayı Kopyala</Button>
        <Button icon={<PrinterOutlined />} loading={printing} onClick={doPrint}>Yazdır / PDF</Button>
      </Space>

      <List
        dataSource={days}
        renderItem={(day) => {
          const preview = schedulePreview(values[day.dateKey]);
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
        {monthLabel} Programını Yayınla
      </Button>

      <Drawer title={selectedDay?.label || ''} open={!!selectedDay} onClose={() => setSelectedDateKey('')} width={440}>
        {selectedItems.map((item, index) => (
          <div key={item.id} style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <Input value={item.etkinlik} onChange={(e) => { const next = [...selectedItems]; next[index] = { ...item, etkinlik: e.target.value }; updateDayItems(selectedDateKey, next); }} placeholder="Etkinlik adı" style={{ flex: 1 }} />
              <Button danger icon={<DeleteOutlined />} onClick={() => updateDayItems(selectedDateKey, selectedItems.filter((_, i) => i !== index))} />
            </div>
            <Select
              allowClear placeholder="Kategori" style={{ width: '100%', marginBottom: 8 }}
              value={item.kategori || undefined}
              onChange={(v) => { const next = [...selectedItems]; next[index] = { ...item, kategori: v || '' }; updateDayItems(selectedDateKey, next); }}
              options={KATEGORILER.map((k) => ({ value: k.key, label: `${k.emoji} ${k.label}` }))}
            />
            <Space style={{ width: '100%', marginBottom: 8 }}>
              <Input value={item.baslangicSaati} onChange={(e) => { const next = [...selectedItems]; next[index] = { ...item, baslangicSaati: e.target.value }; updateDayItems(selectedDateKey, next); }} placeholder="Başlangıç (09:00)" style={{ width: 150 }} />
              <Input value={item.bitisSaati} onChange={(e) => { const next = [...selectedItems]; next[index] = { ...item, bitisSaati: e.target.value }; updateDayItems(selectedDateKey, next); }} placeholder="Bitiş (10:00)" style={{ width: 150 }} />
            </Space>
            <Input.TextArea value={item.aciklama} onChange={(e) => { const next = [...selectedItems]; next[index] = { ...item, aciklama: e.target.value }; updateDayItems(selectedDateKey, next); }} rows={2} placeholder="Açıklama (opsiyonel)" />
          </div>
        ))}
        <Button icon={<PlusOutlined />} block onClick={() => updateDayItems(selectedDateKey, [...selectedItems, emptyActivityItem()])}>Etkinlik Ekle</Button>
      </Drawer>
    </div>
  );
}
