import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Button, Input, message, Popconfirm, Space } from 'antd';
import { LeftOutlined, RightOutlined, PlusOutlined, DeleteOutlined, CopyOutlined, PrinterOutlined } from '@ant-design/icons';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { generateId } from '../utils/crudHelpers';
import { fetchInstitutionInfo, buildMonthlyDocumentHtml, printHtmlDocument } from '../services/documentPdf';
import {
  getMonthKey, getMonthLabel, shiftMonth, countPublished, publishSingleRecord, unpublishMonth,
  fetchActiveSingleRecord,
} from '../services/monthlyDocuments';

const { Title, Text } = Typography;
const NODE_PATH = 'personelGorevListeleri';
const KAYNAK = 'admin_aylik';

function defaultSections() {
  return [
    { id: generateId(), baslik: 'Öğretmenler', icerik: '' },
    { id: generateId(), baslik: 'Mutfak / Temizlik Personeli', icerik: '' },
    { id: generateId(), baslik: 'Genel Hatırlatmalar', icerik: '' },
  ];
}
function hasBulletinContent(baslik, bolumler) {
  if (String(baslik || '').trim()) return true;
  return bolumler.some((s) => String(s.baslik || '').trim() || String(s.icerik || '').trim());
}

// Mobildeki AdminMonthlyStaffTasksScreen.js'in web karşılığı.
export default function StaffTasksPage() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId;

  const [monthDate, setMonthDate] = useState(new Date());
  const monthKey = useMemo(() => getMonthKey(monthDate), [monthDate]);
  const monthLabel = useMemo(() => getMonthLabel(monthDate), [monthDate]);

  const [baslik, setBaslik] = useState('');
  const [bolumler, setBolumler] = useState(defaultSections);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [publishedCount, setPublishedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!kresId) { setLoadingDraft(false); return; }
    setLoadingDraft(true);
    fetchActiveSingleRecord({ nodePath: NODE_PATH, kresId, monthKey, kaynak: KAYNAK }).then((record) => {
      if (cancelled) return;
      if (record) {
        setBaslik(record.baslik || '');
        setBolumler(Array.isArray(record.bolumler) && record.bolumler.length > 0 ? record.bolumler.map((s) => ({ id: generateId(), baslik: s.baslik || '', icerik: s.icerik || '' })) : defaultSections());
      } else {
        setBaslik('');
        setBolumler(defaultSections());
      }
      setLoadingDraft(false);
    });
    return () => { cancelled = true; };
  }, [kresId, monthKey]);

  useEffect(() => {
    if (!kresId) { setPublishedCount(0); return; }
    const q = query(ref(database, NODE_PATH), orderByChild('kresId'), equalTo(kresId));
    const unsub = onValue(q, (snap) => setPublishedCount(countPublished(snap.val(), { kresId, monthKey, kaynak: KAYNAK })), () => setPublishedCount(0));
    return () => unsub();
  }, [kresId, monthKey]);

  function changeMonth(direction) {
    setMonthDate(shiftMonth(monthDate, direction));
  }

  function updateSection(id, field, value) {
    setBolumler((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }
  function addSection() {
    setBolumler((prev) => [...prev, { id: generateId(), baslik: '', icerik: '' }]);
  }
  function removeSection(id) {
    setBolumler((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleCopyPreviousMonth() {
    if (!kresId) return;
    setCopying(true);
    try {
      const prevMonthKey = getMonthKey(shiftMonth(monthDate, -1));
      const prevRecord = await fetchActiveSingleRecord({ nodePath: NODE_PATH, kresId, monthKey: prevMonthKey, kaynak: KAYNAK });
      if (!prevRecord) { message.warning(`${prevMonthKey} için yayınlanmış bir görev listesi yok.`); return; }
      setBaslik(prevRecord.baslik || '');
      setBolumler(Array.isArray(prevRecord.bolumler) && prevRecord.bolumler.length > 0 ? prevRecord.bolumler.map((s) => ({ id: generateId(), baslik: s.baslik || '', icerik: s.icerik || '' })) : defaultSections());
      message.success('Geçen ayın görev listesi kopyalandı.');
    } catch {
      message.error('Geçen ay kopyalanamadı.');
    } finally {
      setCopying(false);
    }
  }

  async function doPublish() {
    if (!hasBulletinContent(baslik, bolumler)) { message.warning('Yayınlamak için en az bir bölüme içerik gir.'); return; }
    setSaving(true);
    try {
      await publishSingleRecord({
        nodePath: NODE_PATH, kresId, monthKey, kaynak: KAYNAK,
        buildRecord: ({ kresId: kId, monthKey: mKey, kaynak, now }) => ({
          kresId: kId, kaynak, ayKey: mKey, tarih: `${mKey}-01`,
          baslik: baslik.trim() || `${monthLabel} Görev Listesi`,
          bolumler: bolumler.filter((s) => s.baslik.trim() || s.icerik.trim()).map((s) => ({ baslik: s.baslik.trim(), icerik: s.icerik.trim() })),
          aktif: true, createdAt: now, updatedAt: now,
        }),
      });
      message.success('Görev listesi yayınlandı');
    } catch {
      message.error('Görev listesi yayınlanamadı.');
    } finally {
      setSaving(false);
    }
  }

  async function doUnpublish() {
    setUnpublishing(true);
    try {
      await unpublishMonth({ nodePath: NODE_PATH, kresId, monthKey, kaynak: KAYNAK });
      message.success('Yayından kaldırıldı');
    } catch {
      message.error('Yayından kaldırılamadı.');
    } finally {
      setUnpublishing(false);
    }
  }

  async function doPrint() {
    setPrinting(true);
    try {
      const kres = await fetchInstitutionInfo(kresId);
      const record = { baslik: baslik.trim() || `${monthLabel} Görev Listesi`, bolumler: bolumler.filter((s) => s.baslik.trim() || s.icerik.trim()) };
      const html = buildMonthlyDocumentHtml({ docType: 'gorev', kres, monthLabel, records: [record] });
      printHtmlDocument(html);
    } catch {
      message.error('Yazdırılacak belge oluşturulamadı.');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>Personel Görev Listesi</Title>
      <Text type="secondary">Ay başına tek bülten — bölüm bölüm görev/hatırlatma</Text>

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

      {!loadingDraft && (
        <>
          <Text strong>Bülten Başlığı (opsiyonel)</Text>
          <Input value={baslik} onChange={(e) => setBaslik(e.target.value)} placeholder={`${monthLabel} Görev Listesi`} style={{ marginTop: 6, marginBottom: 18 }} />

          {bolumler.map((section) => (
            <div key={section.id} style={{ border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <Input value={section.baslik} onChange={(e) => updateSection(section.id, 'baslik', e.target.value)} placeholder="Bölüm başlığı" style={{ flex: 1 }} />
                <Button danger icon={<DeleteOutlined />} onClick={() => removeSection(section.id)} />
              </div>
              <Input.TextArea value={section.icerik} onChange={(e) => updateSection(section.id, 'icerik', e.target.value)} rows={3} placeholder="Bu bölümün içeriği / görevler" />
            </div>
          ))}
          <Button icon={<PlusOutlined />} onClick={addSection} block style={{ marginBottom: 16 }}>Bölüm Ekle</Button>

          <Button type="primary" block loading={saving} onClick={doPublish} style={{ height: 46 }}>Görev Listesini Yayınla</Button>
        </>
      )}
    </div>
  );
}
