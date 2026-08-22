import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Typography, Input, Button, Tag, Empty, Spin, Segmented, message } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { ref, onValue, update, push, get, query, orderByChild, limitToLast, endBefore, increment } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import {
  formatMessageTime,
  getParticipantIds,
  isReadByOtherParticipant,
  mergeMessages,
  MESSAGE_PAGE_SIZE,
  normalizeConversationMeta,
  safeUnread,
} from '../utils/messageHelpers';
import { addConversationIndexUpdates } from '../utils/firebaseIndexHelpers';
import { createUserNotification } from '../utils/notificationCenter';

const { Title, Text } = Typography;

function getConversationId(adminId, role, userId) {
  return `admin_${adminId}_${role}_${userId}`;
}
function getUserName(user) {
  return `${user?.ad || ''} ${user?.soyad || ''}`.trim() || user?.kullaniciAdi || 'Kullanıcı';
}
function getParentChildrenText(parentId, children, classes) {
  const linked = Object.values(children || {}).filter((child) => child?.veliIds?.includes(parentId));
  if (linked.length === 0) return '';
  return linked
    .map((child) => {
      const childName = `${child.ad || child.adSoyad || 'Çocuk'} ${child.soyad || ''}`.trim();
      const className = child.sinifId ? classes?.[child.sinifId]?.ad : '';
      return className ? `${childName} · ${className}` : childName;
    })
    .join(', ');
}
function getTeacherClassText(teacherId, classes) {
  const cls = Object.values(classes || {}).find((item) => Array.isArray(item.ogretmenIds) && item.ogretmenIds.includes(teacherId));
  return cls?.ad || '';
}

// Mobildeki AdminMessagesScreen.js + MessageDetailScreen.js'in web karşılığı
// (iki panelli: sol kişi listesi, sağ sohbet).
export default function MessagesPage() {
  const { kullanici } = useAuth();
  const adminId = kullanici?.uid || kullanici?.id;
  const kresId = kullanici?.kresId || 'kres001';

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState({});
  const [classes, setClasses] = useState({});
  const [children, setChildren] = useState({});
  const [conversations, setConversations] = useState({});
  const [tab, setTab] = useState('all');
  const [selectedContact, setSelectedContact] = useState(null);

  useEffect(() => {
    const unsubs = [];
    const listen = (path, setter) => {
      const unsub = onValue(ref(database, path), (snap) => {
        setter(snap.val() || {});
        setLoading(false);
      });
      unsubs.push(unsub);
    };
    listen('kullanicilar', setUsers);
    listen('siniflar', setClasses);
    listen('cocuklar', setChildren);
    listen('mesajKonusmalari', setConversations);
    return () => unsubs.forEach((unsub) => unsub && unsub());
  }, [kresId]);

  const contacts = useMemo(() => {
    return Object.entries(users)
      .map(([id, user]) => ({ id, ...user }))
      .filter((user) => user.aktif !== false)
      .filter((user) => user.id !== adminId)
      .filter((user) => user.rol === 'veli' || user.rol === 'ogretmen')
      .filter((user) => !user.kresId || user.kresId === kresId)
      .map((user) => {
        const role = user.rol;
        const conversationId = getConversationId(adminId, role, user.id);
        const meta = conversations[conversationId] || {};
        const childInfo = role === 'veli' ? getParentChildrenText(user.id, children, classes) : getTeacherClassText(user.id, classes);
        return {
          ...user, role, conversationId, childInfo,
          sonMesaj: meta.sonMesaj || '',
          sonMesajAt: meta.sonMesajAt || 0,
          unread: safeUnread(meta, adminId),
        };
      })
      .filter((user) => tab === 'all' || user.role === tab)
      .sort((a, b) => Number(b.sonMesajAt || 0) - Number(a.sonMesajAt || 0) || getUserName(a).localeCompare(getUserName(b), 'tr'))
      .slice(0, 20);
  }, [users, children, classes, conversations, adminId, kresId, tab]);

  const openChat = async (contact) => {
    const now = Date.now();
    const conversationMeta = {
      ...(conversations[contact.conversationId] || {}),
      id: contact.conversationId,
      tip: contact.role === 'veli' ? 'admin_veli' : 'admin_ogretmen',
      kresId, adminId,
      hedefId: contact.id,
      hedefRol: contact.role,
      katilimcilar: { [adminId]: true, [contact.id]: true },
      roller: { [adminId]: 'yonetici', [contact.id]: contact.role },
      baslik: getUserName(contact),
      updatedAt: now,
      aktif: true,
    };
    await update(ref(database, `mesajKonusmalari/${contact.conversationId}`), conversationMeta);
    setSelectedContact({ ...contact, conversationMeta });
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: 16 }}>
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <Title level={4} style={{ marginBottom: 8 }}>💬 Mesajlar</Title>
        <Segmented
          block
          value={tab}
          onChange={setTab}
          options={[{ label: 'Tümü', value: 'all' }, { label: 'Veliler', value: 'veli' }, { label: 'Öğretmenler', value: 'ogretmen' }]}
          style={{ marginBottom: 12 }}
        />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : contacts.length === 0 ? (
            <Empty description="Kişi bulunamadı" style={{ marginTop: 40 }} />
          ) : (
            contacts.map((contact) => (
              <div
                key={`${contact.role}_${contact.id}`}
                onClick={() => openChat(contact)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, marginBottom: 6, cursor: 'pointer',
                  background: selectedContact?.id === contact.id && selectedContact?.role === contact.role ? THEME.primarySoft : '#fff',
                  border: `1px solid ${THEME.border}`,
                }}
              >
                <div style={{ fontSize: 22 }}>{contact.role === 'veli' ? '👨‍👩‍👧' : '👩‍🏫'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong ellipsis style={{ maxWidth: 160 }}>{getUserName(contact)}</Text>
                    {contact.unread > 0 && <Tag color="red">{contact.unread > 99 ? '99+' : contact.unread}</Tag>}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }} ellipsis>{contact.childInfo || 'Kurum kullanıcısı'}</Text>
                  <div><Text type="secondary" style={{ fontSize: 12 }} ellipsis>{contact.sonMesaj || 'Henüz mesaj yok'}</Text></div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ flex: 1, borderRadius: 14, border: `1px solid ${THEME.border}`, display: 'flex', flexDirection: 'column' }}>
        {selectedContact ? (
          <ChatPanel key={selectedContact.conversationId} contact={selectedContact} adminId={adminId} kullanici={kullanici} kresId={kresId} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description="Sohbet etmek için bir kişi seç" />
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPanel({ contact, adminId, kullanici, kresId }) {
  const conversationId = contact.conversationId;
  const conversationMeta = contact.conversationMeta;
  const currentUserId = adminId;
  const currentRole = 'yonetici';

  const listRef = useRef(null);
  const isFirstLoadRef = useRef(true);

  const [liveMessages, setLiveMessages] = useState([]);
  const [olderMessages, setOlderMessages] = useState([]);
  const [conversation, setConversation] = useState(conversationMeta || {});
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);

  const allMessages = useMemo(() => mergeMessages(olderMessages, liveMessages), [olderMessages, liveMessages]);

  useEffect(() => {
    if (!conversationId) {
      setLoading(false);
      return;
    }

    const unsubConversation = onValue(ref(database, `mesajKonusmalari/${conversationId}`), (snap) => {
      setConversation(snap.val() || conversationMeta || {});
    });

    const messagesQuery = query(ref(database, `mesajlar/${conversationId}`), orderByChild('createdAt'), limitToLast(MESSAGE_PAGE_SIZE));
    const unsubMessages = onValue(messagesQuery, (snap) => {
      const data = snap.val();
      const list = data ? Object.entries(data).map(([id, item]) => ({ id, ...item })) : [];
      list.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
      setLiveMessages(list);
      setHasMore(list.length === MESSAGE_PAGE_SIZE);
      setLoading(false);

      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        setTimeout(() => listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight }), 120);
      }
    });

    return () => { unsubConversation(); unsubMessages(); };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !currentUserId) return;
    const now = Date.now();
    update(ref(database, `mesajKonusmalari/${conversationId}`), {
      [`okunmamisSayac/${currentUserId}`]: 0,
      [`sonOkuma/${currentUserId}`]: now,
      [`lastSeenAt/${currentUserId}`]: now,
    }).catch(() => {});
  }, [conversationId, currentUserId]);

  const loadOlderMessages = async () => {
    if (!conversationId || loadingMore || allMessages.length === 0) return;
    const oldest = allMessages[0];
    const oldestTime = Number(oldest?.createdAt || 0);
    if (!oldestTime) {
      setHasMore(false);
      return;
    }

    setLoadingMore(true);
    try {
      const olderQuery = query(ref(database, `mesajlar/${conversationId}`), orderByChild('createdAt'), endBefore(oldestTime), limitToLast(MESSAGE_PAGE_SIZE));
      const snapshot = await get(olderQuery);
      const data = snapshot.val();
      const list = data ? Object.entries(data).map(([id, item]) => ({ id, ...item })) : [];
      list.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));

      if (list.length === 0) {
        setHasMore(false);
        return;
      }
      setOlderMessages((prev) => mergeMessages(list, prev));
      if (list.length < MESSAGE_PAGE_SIZE) setHasMore(false);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMore(false);
    }
  };

  const sendMessage = async () => {
    const clean = text.trim();
    if (!clean || sending || !conversationId || !currentUserId) return;

    setSending(true);
    setText('');
    try {
      const now = Date.now();
      const mergedMeta = normalizeConversationMeta({ ...conversationMeta, ...conversation });
      const participants = getParticipantIds(mergedMeta).filter(Boolean);
      if (!participants.includes(currentUserId)) participants.push(currentUserId);

      await push(ref(database, `mesajlar/${conversationId}`), {
        gonderenId: currentUserId, gonderenRol: currentRole, metin: clean, createdAt: now, okunduBy: { [currentUserId]: now },
      });

      const { okunmamisSayac, sonOkuma, ...metaWithoutCounters } = mergedMeta;
      const updates = {
        ...metaWithoutCounters, id: conversationId,
        sonMesaj: clean, sonMesajAt: now, sonGonderenId: currentUserId, aktif: true, updatedAt: now,
        [`sonOkuma/${currentUserId}`]: now,
        [`okunmamisSayac/${currentUserId}`]: 0,
      };
      participants.forEach((participantId) => {
        if (!participantId || participantId === currentUserId) return;
        updates[`okunmamisSayac/${participantId}`] = increment(1);
      });

      const rootUpdates = {};
      addConversationIndexUpdates(rootUpdates, conversationId, metaWithoutCounters);
      if (Object.keys(rootUpdates).length > 0) await update(ref(database), rootUpdates);

      await update(ref(database, `mesajKonusmalari/${conversationId}`), updates);

      const receiverIds = participants.filter((id) => id && id !== currentUserId);
      if (receiverIds.length > 0) {
        const senderName = `${kullanici?.ad || ''} ${kullanici?.soyad || ''}`.trim() || kullanici?.kullaniciAdi || 'Yumurcak Kreş';
        createUserNotification({
          kresId: kresId || mergedMeta.kresId || '',
          userIds: receiverIds,
          baslik: `💬 ${senderName}`,
          mesaj: clean.length > 80 ? `${clean.slice(0, 80)}...` : clean,
          tip: 'mesaj',
          routeName: 'MessageDetail',
          routeParams: { conversationId },
          createdBy: currentUserId,
        }).catch((err) => console.warn('Mesaj gönderildi ama bildirim oluşturulamadı:', err));
      }

      setTimeout(() => listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 80);
    } catch (err) {
      console.error(err);
      message.error('Mesaj gönderilemedi.');
      setText(clean);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${THEME.border}` }}>
        <Text strong style={{ fontSize: 16 }}>{getUserName(contact)}</Text>
        <div><Text type="secondary" style={{ fontSize: 12 }}>{contact.role === 'veli' ? `Veli · ${contact.childInfo || ''}` : `Öğretmen · ${contact.childInfo || ''}`}</Text></div>
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 16, background: THEME.bg }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 40 }}><Spin /></div>
        ) : (
          <>
            {hasMore ? (
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <Button size="small" loading={loadingMore} onClick={loadOlderMessages}>Daha fazla mesaj yükle</Button>
              </div>
            ) : allMessages.length > 0 ? (
              <Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 12, marginBottom: 12 }}>Konuşmanın başlangıcı</Text>
            ) : null}

            {allMessages.length === 0 ? (
              <Empty description="Henüz mesaj yok" style={{ marginTop: 40 }} />
            ) : (
              allMessages.map((item) => {
                const mine = item.gonderenId === currentUserId;
                const read = isReadByOtherParticipant(item, conversation, currentUserId);
                return (
                  <div key={item.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                    <div style={{ maxWidth: '70%', borderRadius: 16, padding: '9px 13px', background: mine ? THEME.primary : '#fff', border: mine ? 'none' : `1px solid ${THEME.border}` }}>
                      <div style={{ color: mine ? '#fff' : THEME.text, fontSize: 14 }}>{item.metin}</div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                        <Text style={{ fontSize: 10, color: mine ? 'rgba(255,255,255,0.72)' : THEME.muted }}>{formatMessageTime(item.createdAt)}</Text>
                        {mine && <Text style={{ fontSize: 10, fontWeight: 700, color: read ? '#BFFFD2' : 'rgba(255,255,255,0.72)' }}>{read ? 'Okundu' : 'Gönderildi'}</Text>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${THEME.border}` }}>
        <Input.TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mesaj yaz..."
          autoSize={{ minRows: 1, maxRows: 4 }}
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          disabled={sending}
        />
        <Button type="primary" icon={<SendOutlined />} onClick={sendMessage} disabled={!text.trim() || sending} loading={sending} />
      </div>
    </>
  );
}
