// Mobildeki src/utils/messageHelpers.js'in web karşılığı.
import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../config/firebase';

export const MESSAGE_PAGE_SIZE = 20;

export function safeUnread(meta, userId) {
  if (!meta || !userId) return 0;
  const value = meta?.okunmamisSayac?.[userId];
  const number = Number(value || 0);
  return Number.isNaN(number) ? 0 : number;
}

export function getParticipantIds(meta = {}) {
  const set = new Set();
  if (meta.katilimcilar && typeof meta.katilimcilar === 'object') {
    Object.keys(meta.katilimcilar).forEach((id) => id && set.add(id));
  }
  [meta.adminId, meta.hedefId, meta.veliId, meta.ogretmenId, meta.gonderenId, meta.aliciId].forEach((id) => id && set.add(id));
  return Array.from(set);
}

export function isReadByOtherParticipant(message, conversation, currentUserId) {
  if (!message || !conversation || !currentUserId) return false;
  if (message.gonderenId !== currentUserId) return false;

  const sonOkuma = conversation.sonOkuma || {};
  return Object.entries(sonOkuma).some(([userId, readAt]) => {
    if (userId === currentUserId) return false;
    return Number(readAt || 0) >= Number(message.createdAt || 0);
  });
}

export function formatMessageTime(value) {
  if (!value) return '';
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  if (sameDay) return time;
  return `${date.toLocaleDateString('tr-TR')} ${time}`;
}

export function mergeMessages(...groups) {
  const map = new Map();
  groups.flat().forEach((msg) => {
    if (!msg || !msg.id) return;
    map.set(msg.id, { ...(map.get(msg.id) || {}), ...msg });
  });
  return Array.from(map.values()).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

function cleanFirebaseValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value.map((item) => cleanFirebaseValue(item)).filter((item) => item !== undefined);
  }

  if (typeof value === 'object') {
    return Object.entries(value).reduce((acc, entry) => {
      const key = entry[0];
      const item = entry[1];
      const cleaned = cleanFirebaseValue(item);
      if (cleaned !== undefined) acc[key] = cleaned;
      return acc;
    }, {});
  }

  return value;
}

export function normalizeConversationMeta(meta = {}) {
  return cleanFirebaseValue({ ...(meta || {}), aktif: true });
}

function indexIds(data) {
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data).filter(([, value]) => value !== false && value !== null).map(([id]) => id);
}

export function useUnreadMessagesCount(userId) {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!userId) {
      setTotal(0);
      return undefined;
    }

    let metaUnsubs = [];
    let indexUnsub = null;

    const clearMetaListeners = () => {
      metaUnsubs.forEach((unsub) => unsub && unsub());
      metaUnsubs = [];
    };

    indexUnsub = onValue(
      ref(database, `kullaniciKonusmalari/${userId}`),
      (snapshot) => {
        const ids = indexIds(snapshot.val());
        clearMetaListeners();

        if (ids.length === 0) {
          setTotal(0);
          return;
        }

        const sums = {};
        const publish = () => setTotal(Object.values(sums).reduce((acc, value) => acc + value, 0));

        ids.forEach((conversationId) => {
          const unsub = onValue(
            ref(database, `mesajKonusmalari/${conversationId}`),
            (metaSnap) => {
              sums[conversationId] = safeUnread(metaSnap.val(), userId);
              publish();
            },
            () => {
              sums[conversationId] = 0;
              publish();
            }
          );
          metaUnsubs.push(unsub);
        });
      },
      () => {
        clearMetaListeners();
        setTotal(0);
      }
    );

    return () => {
      indexUnsub && indexUnsub();
      clearMetaListeners();
    };
  }, [userId]);

  return total;
}
