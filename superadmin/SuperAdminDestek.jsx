import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Input, List, Modal, Row, Select, Space, Statistic, Tag, Typography, message } from 'antd';
import { CloseCircleOutlined, MessageOutlined, SendOutlined } from '@ant-design/icons';
import { onValue, push, ref, update } from 'firebase/database';
import { database } from '../src/config/firebase';
import { useAuth } from '../src/context/AuthContext';
import { createNotification } from '../src/utils/notificationCenter';
import { getPlatformSnapshot } from './superadminService';

const { Title, Text } = Typography;
const MAX_LEN = 5000;

function listObject(value) {
  return Object.entries(value || {}).map(([id, item]) => ({ id, ...(item || {}) }));
}
function userName(user) {
  return `${user?.ad || ''} ${user?.soyad || ''}`.trim() || user?.kullaniciAdi || 'Kullanıcı';
}
function formatDate(value) {
  if (!value) return '-';
  const d = new Date(Number(value));
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function statusTag(status) {
  if (status === 'kapandi') return <Tag color="default">Kapandı</Tag>;
  if (status === 'yanitlandi') return <Tag color="green">Yanıtlandı</Tag>;
  return <Tag color="orange">Yeni</Tag>;
}

export default function SuperAdminDestek() {
  const { kullanici } = useAuth();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [institutions, setInstitutions] = useState([]);
  const [users, setUsers] = useState([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [targetKresId, setTargetKresId] = useState('');
  const [targetAdminId, setTargetAdminId] = useState('');
  const [composeSubject, setComposeSubject] = useState('Bilgilendirme');
  const [composeText, setComposeText] = useState('');
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    const unsubscribe = onValue(ref(database, 'destekMesajlari'), (snap) => {
      const rows = listObject(snap.val()).sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
      setMessages(rows);
      setLoading(false);
    }, () => { setMessages([]); setLoading(false); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let alive = true;
    getPlatformSnapshot().then((data) => {
      if (!alive) return;
      setInstitutions(data.institutions || []);
      setUsers(data.users || []);
    }).catch((err) => { console.error(err); message.error('Kurum ve yönetici listesi alınamadı.'); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => filter === 'all' ? messages : messages.filter((item) => String(item.durum || 'yeni') === filter), [messages, filter]);
  const stats = useMemo(() => ({ total: messages.length, yeni: messages.filter((x) => String(x.durum || 'yeni') === 'yeni').length, yanitlandi: messages.filter((x) => x.durum === 'yanitlandi').length, kapandi: messages.filter((x) => x.durum === 'kapandi').length }), [messages]);
  const admins = useMemo(() => users.filter((u) => u.rol === 'yonetici' && u.aktif !== false && (!targetKresId || u.kresId === targetKresId)), [users, targetKresId]);

  const sendReply = async () => {
    const clean = reply.trim();
    if (!selected || !clean) return;
    if (clean.length > MAX_LEN) return message.warning(`Cevap en fazla ${MAX_LEN} karakter olabilir.`);
    setSending(true);
    try {
      const now = Date.now();
      const replyRef = push(ref(database, `destekMesajlari/${selected.id}/yanitlar`));
      await update(ref(database), {
        [`destekMesajlari/${selected.id}/yanitlar/${replyRef.key}`]: {
          id: replyRef.key, mesaj: clean, authorId: kullanici?.id || kullanici?.uid || 'superadmin', authorName: userName(kullanici) || 'Yumurcak Destek', authorRole: 'superadmin', createdAt: now,
        },
        [`destekMesajlari/${selected.id}/durum`]: 'yanitlandi',
        [`destekMesajlari/${selected.id}/lastReplyAt`]: now,
        [`destekMesajlari/${selected.id}/updatedAt`]: now,
      });
      setReply('');
      message.success('Cevap gönderildi.');
    } catch (err) { console.error(err); message.error('Cevap gönderilemedi.'); } finally { setSending(false); }
  };

  const closeTicket = async () => {
    if (!selected) return;
    try {
      await update(ref(database, `destekMesajlari/${selected.id}`), { durum: 'kapandi', updatedAt: Date.now() });
      message.success('Destek talebi kapatıldı.');
      setSelected((prev) => prev ? { ...prev, durum: 'kapandi' } : prev);
    } catch (err) { console.error(err); message.error('Talep kapatılamadı.'); }
  };

  const sendToAdmin = async () => {
    const clean = composeText.trim();
    if (!targetKresId || !targetAdminId || !clean) return message.warning('Kurum, yönetici ve mesaj alanlarını doldur.');
    if (clean.length > MAX_LEN) return message.warning(`Mesaj en fazla ${MAX_LEN} karakter olabilir.`);
    const institution = institutions.find((x) => x.id === targetKresId);
    const admin = users.find((x) => x.id === targetAdminId);
    if (!admin) return message.error('Yönetici bulunamadı.');
    setComposing(true);
    try {
      const now = Date.now();
      const newRef = push(ref(database, 'destekMesajlari'));
      await update(ref(database), {
        [`destekMesajlari/${newRef.key}`]: {
          id: newRef.key, konu: 'superadmin_bilgilendirme', konuBaslik: composeSubject.trim() || 'Yumurcak Bilgilendirme', mesaj: clean, durum: 'yeni',
          kresId: targetKresId, kresAdi: institution?.ad || institution?.isim || institution?.kresAdi || '',
          userId: targetAdminId, userRole: 'yonetici', userName: userName(admin), userPhone: admin.telefon || '', userUsername: admin.kullaniciAdi || '',
          senderId: kullanici?.id || kullanici?.uid || 'superadmin', senderRole: 'superadmin', senderName: userName(kullanici) || 'Yumurcak Destek', createdAt: now, updatedAt: now,
        },
      });
      await createNotification({
        kresId: targetKresId, hedefUserIds: [targetAdminId], baslik: `💬 ${composeSubject.trim() || 'Yumurcak Bilgilendirme'}`,
        mesaj: clean.length > 100 ? `${clean.slice(0, 100)}...` : clean, tip: 'destek', routeName: 'Support', createdBy: kullanici?.id || kullanici?.uid || 'superadmin',
      }).catch((err) => console.warn('Destek bildirimi oluşturulamadı:', err));
      message.success(`${userName(admin)} adlı yöneticiye mesaj gönderildi.`);
      setComposeText(''); setComposeSubject('Bilgilendirme'); setComposeOpen(false); setTargetAdminId('');
    } catch (err) { console.error(err); message.error('Mesaj gönderilemedi.'); } finally { setComposing(false); }
  };

  const replies = selected ? listObject(selected.yanitlar).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)) : [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16 }}>
        <div><Title level={3} style={{ margin: 0 }}>💬 Destek Merkezi</Title><Text type="secondary">Kurum yöneticilerinden gelen destek talepleri ve Yumurcak’tan gönderilen mesajlar.</Text></div>
        <Button type="primary" icon={<SendOutlined />} onClick={() => setComposeOpen(true)}>Kurum Yöneticisine Mesaj Gönder</Button>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
        <Col xs={12} md={6}><Card><Statistic title="Toplam Talep" value={stats.total} prefix={<MessageOutlined />} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Yeni" value={stats.yeni} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Yanıtlandı" value={stats.yanitlandi} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Kapandı" value={stats.kapandi} /></Card></Col>
      </Row>

      <Card styles={{ body: { padding: 12 } }}>
        <Space style={{ marginBottom: 12 }} wrap>
          {['all', 'yeni', 'yanitlandi', 'kapandi'].map((key) => <Button key={key} type={filter === key ? 'primary' : 'default'} onClick={() => setFilter(key)}>{key === 'all' ? 'Tümü' : key === 'yeni' ? 'Yeni' : key === 'yanitlandi' ? 'Yanıtlandı' : 'Kapandı'}</Button>)}
        </Space>
        <List loading={loading} dataSource={filtered} locale={{ emptyText: <Empty description="Destek mesajı yok" /> }} renderItem={(item) => (
          <List.Item onClick={() => setSelected(item)} style={{ cursor: 'pointer', padding: '14px 12px', borderRadius: 10 }}>
            <List.Item.Meta title={<Space>{item.konuBaslik || item.konu || 'Destek'} {statusTag(item.durum)}</Space>} description={<>{item.userName || 'Kullanıcı'} · {item.kresAdi || item.kresId || 'Kurum yok'}<br /><Text type="secondary">{item.mesaj || ''}</Text></>} />
            <Text type="secondary">{formatDate(item.updatedAt || item.createdAt)}</Text>
          </List.Item>
        )} />
      </Card>

      <Modal open={!!selected} onCancel={() => setSelected(null)} title={selected ? (selected.konuBaslik || 'Destek Talebi') : ''} width={760} footer={null}>
        {selected && <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Alert type="info" showIcon message={`${selected.userName || 'Kullanıcı'} · ${selected.kresAdi || selected.kresId || 'Kurum yok'}`} description={`Gönderim: ${formatDate(selected.createdAt)} · Kullanıcı: ${selected.userUsername || '-'}`} />
          <Card size="small"><Text>{selected.mesaj}</Text></Card>
          {replies.map((item) => <Card key={item.id} size="small" style={{ background: String(item.authorRole).includes('super') ? '#F6F2FF' : '#FAFAFA' }}><Text strong>{String(item.authorRole).includes('super') ? 'Yumurcak Destek' : (item.authorName || 'Kullanıcı')}</Text><div style={{ marginTop: 6 }}>{item.mesaj}</div><Text type="secondary" style={{ fontSize: 11 }}>{formatDate(item.createdAt)}</Text></Card>)}
          <Input.TextArea rows={4} maxLength={MAX_LEN} showCount value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Cevabınızı yazın..." />
          <Space><Button type="primary" icon={<SendOutlined />} loading={sending} onClick={sendReply}>Cevap Gönder</Button><Button danger icon={<CloseCircleOutlined />} onClick={closeTicket} disabled={selected.durum === 'kapandi'}>Talebi Kapat</Button></Space>
        </Space>}
      </Modal>

      <Modal open={composeOpen} onCancel={() => !composing && setComposeOpen(false)} title="Kurum Yöneticisine Mesaj Gönder" okText="Gönder" cancelText="İptal" onOk={sendToAdmin} confirmLoading={composing} width={620}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Select showSearch placeholder="Kurum seç" style={{ width: '100%' }} value={targetKresId || undefined} onChange={(value) => { setTargetKresId(value); setTargetAdminId(''); }} optionFilterProp="label" options={institutions.map((x) => ({ value: x.id, label: x.ad || x.isim || x.kresAdi || x.id }))} />
          <Select showSearch placeholder="Kurum yöneticisi seç" style={{ width: '100%' }} value={targetAdminId || undefined} onChange={setTargetAdminId} optionFilterProp="label" disabled={!targetKresId} options={admins.map((x) => ({ value: x.id, label: `${userName(x)} · ${x.kullaniciAdi || x.telefon || ''}` }))} />
          <Input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Konu" maxLength={120} />
          <Input.TextArea value={composeText} onChange={(e) => setComposeText(e.target.value)} placeholder="Mesajınızı yazın..." rows={7} maxLength={MAX_LEN} showCount />
        </Space>
      </Modal>
    </div>
  );
}
