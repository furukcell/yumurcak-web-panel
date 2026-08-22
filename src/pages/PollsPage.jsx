import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Card, Button, Input, Space, Tag, message, Empty, Progress, Popconfirm, Row, Col } from 'antd';
import { PlusOutlined, MinusCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { ref, onValue, push, update, remove } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';

const { Title, Text, Paragraph } = Typography;

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function toList(data) {
  return Object.entries(safeObject(data)).map(([id, item]) => ({ id, ...safeObject(item) }));
}
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'object') return Object.values(value);
  return [value];
}
function cleanOptions(raw) {
  if (Array.isArray(raw)) return raw.map((x) => String(x || '').trim()).filter(Boolean);
  return String(raw || '').split('\n').map((x) => x.trim()).filter(Boolean);
}
function getOptionLabel(option, index) {
  if (typeof option === 'string') return option;
  const obj = safeObject(option);
  return obj.label || obj.text || obj.value || obj.baslik || `Seçenek ${index + 1}`;
}
function normalizeOptions(value) {
  if (typeof value === 'string') return cleanOptions(value);
  return asArray(value).map((option, index) => getOptionLabel(option, index)).filter(Boolean);
}
function getAnswerValue(answer) {
  if (typeof answer === 'string') return answer;
  const obj = safeObject(answer);
  return obj.secenek || obj.cevap || obj.answer || obj.value || obj.label || '';
}
function getOptionPercent(item, label) {
  const cevaplar = Object.values(safeObject(item.cevaplar || item.answers || item.responses));
  const total = cevaplar.length;
  const count = cevaplar.filter((c) => getAnswerValue(c) === label).length;
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  return { count, percent };
}
function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR');
}
function makeOptionId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Mobildeki PollManagementScreen.js'in web karşılığı.
export default function PollsPage() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId || kullanici?.kurumId || null;

  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [baslik, setBaslik] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [optionInputs, setOptionInputs] = useState([
    { id: makeOptionId(), value: 'Evet' },
    { id: makeOptionId(), value: 'Hayır' },
  ]);

  useEffect(() => {
    setLoading(true);
    const unsub = onValue(
      ref(database, 'anketler'),
      (snap) => {
        const list = toList(snap.val())
          .filter((item) => !kresId || !item.kresId || item.kresId === kresId || item.kurumId === kresId)
          .map((item) => ({
            ...item,
            baslik: item.baslik || item.title || 'Anket',
            aciklama: item.aciklama || item.description || '',
            secenekler: normalizeOptions(item.secenekler || item.options || item.choices),
            cevaplar: safeObject(item.cevaplar || item.answers || item.responses),
          }))
          .sort((a, b) => Number(b.createdAt || b.updatedAt || 0) - Number(a.createdAt || a.updatedAt || 0));
        setPolls(list);
        setLoading(false);
      },
      () => { setPolls([]); setLoading(false); }
    );
    return () => unsub();
  }, [kresId]);

  const toplamAktif = useMemo(() => polls.filter((x) => x.aktif !== false).length, [polls]);
  const toplamCevap = useMemo(() => polls.reduce((sum, p) => sum + Object.keys(safeObject(p.cevaplar)).length, 0), [polls]);

  const updateOption = (id, value) => setOptionInputs((prev) => prev.map((item) => (item.id === id ? { ...item, value } : item)));
  const addOption = () => setOptionInputs((prev) => [...prev, { id: makeOptionId(), value: '' }]);
  const removeOption = (id) => {
    if (optionInputs.length <= 2) {
      message.warning('Anket için en az 2 seçenek olmalı.');
      return;
    }
    setOptionInputs((prev) => prev.filter((item) => item.id !== id));
  };

  async function createPoll() {
    const title = baslik.trim();
    const options = cleanOptions(optionInputs.map((item) => item.value));

    if (!title) return message.error('Anket başlığı yazmalısın.');
    if (options.length < 2) return message.error('En az 2 seçenek olmalı.');

    setSaving(true);
    try {
      await push(ref(database, 'anketler'), {
        kresId, kurumId: kresId,
        baslik: title, title,
        aciklama: aciklama.trim() || '', description: aciklama.trim() || '',
        secenekler: options, options,
        aktif: true, cevaplar: {},
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      setBaslik('');
      setAciklama('');
      setOptionInputs([{ id: makeOptionId(), value: 'Evet' }, { id: makeOptionId(), value: 'Hayır' }]);
      message.success('Anket oluşturuldu');
    } catch (e) {
      message.error('Anket oluşturulamadı.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item) {
    if (!item?.id || busyId) return;
    setBusyId(item.id);
    try {
      await update(ref(database, `anketler/${item.id}`), { aktif: item.aktif === false, updatedAt: Date.now() });
    } catch (e) {
      message.error('Anket durumu güncellenemedi.');
    } finally {
      setBusyId(null);
    }
  }

  async function deletePoll(item) {
    if (!item?.id || busyId) return;
    setBusyId(item.id);
    try {
      await remove(ref(database, `anketler/${item.id}`));
      message.success('Anket silindi');
    } catch (e) {
      message.error('Anket silinemedi.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>Anket Yönetimi</Title>
      <Text type="secondary">Velilerden görüş toplamak için hızlı anketler oluştur.</Text>

      <Row gutter={[12, 12]} style={{ margin: '16px 0 20px' }}>
        <Col xs={12} md={8}><Card size="small" style={{ textAlign: 'center', borderColor: THEME.border }}><Text strong style={{ fontSize: 22, color: THEME.primary }}>{polls.length}</Text><br /><Text type="secondary">Toplam Anket</Text></Card></Col>
        <Col xs={12} md={8}><Card size="small" style={{ textAlign: 'center', borderColor: THEME.border }}><Text strong style={{ fontSize: 22, color: THEME.green }}>{toplamAktif}</Text><br /><Text type="secondary">Aktif Anket</Text></Card></Col>
        <Col xs={24} md={8}><Card size="small" style={{ textAlign: 'center', borderColor: THEME.border }}><Text strong style={{ fontSize: 22, color: THEME.purple }}>{toplamCevap}</Text><br /><Text type="secondary">Toplam Cevap</Text></Card></Col>
      </Row>

      <Card style={{ marginBottom: 24, borderColor: THEME.border }} title="Yeni Anket Oluştur">
        <Text strong>Başlık</Text>
        <Input value={baslik} onChange={(e) => setBaslik(e.target.value)} placeholder="Örn: Yaz kampı ilgi anketi" style={{ marginTop: 6, marginBottom: 14 }} />

        <Text strong>Açıklama (opsiyonel)</Text>
        <Input.TextArea value={aciklama} onChange={(e) => setAciklama(e.target.value)} rows={2} placeholder="Anket hakkında kısa açıklama" style={{ marginTop: 6, marginBottom: 14 }} />

        <Text strong>Seçenekler</Text>
        <div style={{ marginTop: 8 }}>
          {optionInputs.map((opt) => (
            <Space key={opt.id} style={{ display: 'flex', marginBottom: 8 }}>
              <Input value={opt.value} onChange={(e) => updateOption(opt.id, e.target.value)} placeholder="Seçenek" style={{ width: 280 }} />
              <Button icon={<MinusCircleOutlined />} onClick={() => removeOption(opt.id)} />
            </Space>
          ))}
        </div>
        <Button icon={<PlusOutlined />} onClick={addOption} style={{ marginBottom: 16 }}>Seçenek Ekle</Button>

        <div>
          <Button type="primary" loading={saving} onClick={createPoll}>Anketi Oluştur</Button>
        </div>
      </Card>

      <Title level={5} style={{ marginBottom: 12 }}>Anketler</Title>
      {loading ? null : polls.length === 0 ? (
        <Empty description="Henüz anket oluşturulmamış" />
      ) : (
        polls.map((item) => {
          const cevapSayisi = Object.keys(safeObject(item.cevaplar)).length;
          const active = item.aktif !== false;
          const busy = busyId === item.id;

          return (
            <Card key={item.id} style={{ marginBottom: 14, borderColor: THEME.border }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Text strong style={{ fontSize: 16 }}>{item.baslik}</Text>
                  {item.aciklama && <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>{item.aciklama}</Paragraph>}
                  <Text type="secondary" style={{ fontSize: 12 }}>📅 {formatDate(item.createdAt)} · 💬 {cevapSayisi} cevap</Text>
                </div>
                <Tag color={active ? 'green' : 'default'}>{active ? 'Aktif' : 'Pasif'}</Tag>
              </div>

              <div style={{ background: '#FAF9FF', borderRadius: 12, padding: 12, marginTop: 12, marginBottom: 12 }}>
                {item.secenekler.length === 0 ? (
                  <Text type="secondary">Bu anket için seçenek eklenmemiş</Text>
                ) : (
                  item.secenekler.map((label, index) => {
                    const { count, percent } = getOptionPercent(item, label);
                    return (
                      <div key={`${item.id}-${label}-${index}`} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text strong style={{ fontSize: 13 }}>{label}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>{count} · %{percent}</Text>
                        </div>
                        <Progress percent={percent} showInfo={false} strokeColor={THEME.purple} trailColor="#ECE8F8" />
                      </div>
                    );
                  })
                )}
              </div>

              <Space>
                <Button size="small" loading={busy} onClick={() => toggleActive(item)}>{active ? 'Pasif Yap' : 'Aktif Et'}</Button>
                <Popconfirm title="Bu anketi ve cevaplarını tamamen sil?" okText="Sil" cancelText="Vazgeç" okButtonProps={{ danger: true }} onConfirm={() => deletePoll(item)}>
                  <Button size="small" danger icon={<DeleteOutlined />} loading={busy}>Sil</Button>
                </Popconfirm>
              </Space>
            </Card>
          );
        })
      )}
    </div>
  );
}
