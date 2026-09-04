import React, { useEffect, useState } from 'react';
import { Card, Typography, Spin, Empty, Progress, Tag } from 'antd';
import { CheckSquareOutlined, CoffeeOutlined, CalendarOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { todayDateKey } from '../services/monthlyDocuments';
import { toList, filterByKres, getChildId, isAbsentStatus, isSameDay, extractDate, getName, findClassName } from '../utils/statisticsHelpers';
import { THEME } from '../theme';

const { Text, Title } = Typography;

// "Bugünkü Yoklama" — Genel Özet'in altındaki Günlük Özet şeridindeki ana
// kart. Öğretmenlerin kendi tarafında girdiği 'yoklamalar' node'unu
// SADECE okur, admin panelden yoklama girişi YAPILMAZ — bkz. sohbet notu.
// Sınıf bazlı geldi/gelmedi kırılımı + gelmeyen çocukların isim listesi.
function useTodayAttendance(kresId) {
  const [state, setState] = useState({ loading: true, classes: [], present: 0, total: 0 });

  useEffect(() => {
    if (!kresId) { setState({ loading: false, classes: [], present: 0, total: 0 }); return undefined; }
    const today = todayDateKey();
    let children = null;
    let classes = null;
    let attendance = null;

    const build = () => {
      if (!children || !classes || !attendance) return;
      const todaysRecords = attendance.filter((item) => isSameDay(item, today) || extractDate(item) === today);
      // Çocuk başına bugünün en son kaydı (birden fazla girişse en güncel olan geçerli).
      const byChild = new Map();
      todaysRecords.forEach((item) => {
        const childId = getChildId(item);
        if (!childId) return;
        const time = Number(item.updatedAt || item.createdAt || 0);
        const prev = byChild.get(childId);
        if (!prev || time >= prev._time) byChild.set(childId, { ...item, _time: time });
      });

      const classGroups = new Map();
      const addToGroup = (classId, className) => {
        if (!classGroups.has(classId)) {
          classGroups.set(classId, { classId, className: className || 'Sınıfsız', total: 0, present: 0, absentChildren: [] });
        }
        return classGroups.get(classId);
      };

      children.forEach((child) => {
        const classId = child.sinifId || child.classId || '_none';
        const className = classId === '_none' ? 'Sınıfsız' : findClassName(classes, classId);
        const group = addToGroup(classId, className);
        group.total += 1;
        const record = byChild.get(child.id);
        const geldi = record && !isAbsentStatus(record.durum || record.status);
        if (geldi) group.present += 1;
        else group.absentChildren.push({ id: child.id, name: getName(child, child.adSoyad || 'Çocuk'), recorded: !!record });
      });

      const groups = Array.from(classGroups.values()).sort((a, b) => a.className.localeCompare(b.className, 'tr'));
      const total = children.length;
      const present = groups.reduce((sum, g) => sum + g.present, 0);
      setState({ loading: false, classes: groups, present, total });
    };

    const childrenUnsub = onValue(
      query(ref(database, 'cocuklar'), orderByChild('kresId'), equalTo(kresId)),
      (snap) => { children = toList(snap.val()); build(); },
      () => { children = []; build(); }
    );
    const classesUnsub = onValue(
      query(ref(database, 'siniflar'), orderByChild('kresId'), equalTo(kresId)),
      (snap) => { classes = toList(snap.val()); build(); },
      () => { classes = []; build(); }
    );
    const attendanceUnsub = onValue(
      query(ref(database, 'yoklamalar'), orderByChild('kresId'), equalTo(kresId)),
      (snap) => { attendance = filterByKres(toList(snap.val()), kresId); build(); },
      () => { attendance = []; build(); }
    );

    return () => { childrenUnsub(); classesUnsub(); attendanceUnsub(); };
  }, [kresId]);

  return state;
}

// "Bugünkü Menü" — yemekListeleri node'unda tarih=bugün olan kaydı bulur
// (varsa genel/sınıfsız kayıt öncelikli), kahvaltı/öğle/ara öğün özetler.
function useTodayMeal(kresId) {
  const [state, setState] = useState({ loading: true, summary: null });

  useEffect(() => {
    if (!kresId) { setState({ loading: false, summary: null }); return undefined; }
    const today = todayDateKey();
    const q = query(ref(database, 'yemekListeleri'), orderByChild('kresId'), equalTo(kresId));
    const unsub = onValue(
      q,
      (snap) => {
        const list = toList(snap.val()).filter((item) => item.tarih === today);
        if (!list.length) { setState({ loading: false, summary: null }); return; }
        const record = list.find((item) => !item.sinifId) || list[0];
        const ogunler = record.ogunler || {};
        const parts = [
          { label: 'Kahvaltı', items: ogunler.kahvalti },
          { label: 'Öğle', items: ogunler.ogle },
          { label: 'Ara Öğün', items: ogunler.araOgun },
        ].filter((p) => Array.isArray(p.items) && p.items.length);
        setState({ loading: false, summary: parts.length ? parts : null });
      },
      () => setState({ loading: false, summary: null })
    );
    return unsub;
  }, [kresId]);

  return state;
}

// "Bugünkü Etkinlik" — etkinlikler node'unda tarih tam olarak bugüne
// eşit olan kayıtlar (Genel Özet'teki "Yaklaşan Etkinlikler" panelinden
// FARKLI — o gelecekteki en yakın 3 kaydı gösteriyor, bu SADECE bugünü).
function useTodayEvents(kresId) {
  const [state, setState] = useState({ loading: true, events: [] });

  useEffect(() => {
    if (!kresId) { setState({ loading: false, events: [] }); return undefined; }
    const today = todayDateKey();
    const q = query(ref(database, 'etkinlikler'), orderByChild('kresId'), equalTo(kresId));
    const unsub = onValue(
      q,
      (snap) => {
        const list = toList(snap.val()).filter((item) => item.aktif !== false && item.tarih === today);
        setState({ loading: false, events: list });
      },
      () => setState({ loading: false, events: [] })
    );
    return unsub;
  }, [kresId]);

  return state;
}

// Kartın üstünde marka rengiyle (THEME.primary) ince bir çizgi + gövdede
// aynı rengin çok soluk (%5 alfa) tonu ve hafif gölge — tüm kartlarda
// (Günlük Özet + alttaki özet panelleri) tutarlı tek stil.
function CardShell({ title, icon, loading, empty, emptyText, onSeeAll, children }) {
  return (
    <Card
      size="small"
      style={{
        borderColor: THEME.border,
        height: '100%',
        borderTop: `3px solid ${THEME.primary}`,
        borderTopLeftRadius: THEME.radiusSm,
        borderTopRightRadius: THEME.radiusSm,
        background: `${THEME.primary}0D`,
        boxShadow: THEME.shadow,
      }}
      styles={{ body: { padding: 16 } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: onSeeAll ? 'pointer' : 'default' }} onClick={onSeeAll}>
        <span style={{ fontSize: 14, color: THEME.primary, display: 'flex' }}>{icon}</span>
        <Text strong style={{ fontSize: 13 }}>{title}</Text>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
      ) : empty ? (
        <Empty
          description={<Text type="secondary" style={{ fontSize: 12 }}>{emptyText}</Text>}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '8px 0' }}
        />
      ) : (
        children
      )}
    </Card>
  );
}

function AttendanceCard({ navigate, kresId }) {
  const { loading, classes, present, total } = useTodayAttendance(kresId);
  const [openClassId, setOpenClassId] = useState(null);
  const absent = total - present;
  const rate = total ? Math.round((present / total) * 100) : 0;

  return (
    <CardShell
      title="Bugünkü Yoklama"
      icon={<CheckSquareOutlined />}
      color={THEME.green}
      loading={loading}
      empty={!total}
      emptyText="Kayıtlı çocuk yok"
      onSeeAll={() => navigate('/istatistik')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Progress type="circle" percent={rate} size={48} strokeColor={THEME.green} format={() => `${present}/${total}`} />
        <div>
          <Text strong style={{ fontSize: 14, display: 'block' }}>{present} geldi</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{absent} gelmedi</Text>
        </div>
      </div>
      <div>
        {classes.map((group) => {
          const isOpen = openClassId === group.classId;
          return (
            <div key={group.classId} style={{ borderTop: `1px solid ${THEME.border}`, padding: '8px 0' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: group.absentChildren.length ? 'pointer' : 'default' }}
                onClick={() => group.absentChildren.length && setOpenClassId(isOpen ? null : group.classId)}
              >
                <Text style={{ fontSize: 12.5, fontWeight: 600 }}>{group.className}</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{group.present}/{group.total} geldi</Text>
                  {group.absentChildren.length > 0 && (isOpen ? <UpOutlined style={{ fontSize: 10, color: THEME.muted }} /> : <DownOutlined style={{ fontSize: 10, color: THEME.muted }} />)}
                </div>
              </div>
              {isOpen && (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {group.absentChildren.map((child) => (
                    <Tag key={child.id} color={child.recorded ? THEME.red : undefined} style={{ margin: 0, fontSize: 11 }}>
                      {child.name}{!child.recorded ? ' · girilmedi' : ''}
                    </Tag>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

function MealCard({ navigate, kresId }) {
  const { loading, summary } = useTodayMeal(kresId);
  return (
    <CardShell
      title="Bugünkü Menü"
      icon={<CoffeeOutlined />}
      color={THEME.orange}
      loading={loading}
      empty={!summary}
      emptyText="Bugün için menü girilmedi"
      onSeeAll={() => navigate('/yemek-listesi')}
    >
      {summary && summary.map((part) => (
        <div key={part.label} style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 700 }}>{part.label}</Text>
          <div><Text style={{ fontSize: 12.5 }}>{part.items.join(', ')}</Text></div>
        </div>
      ))}
    </CardShell>
  );
}

function EventCard({ navigate, kresId }) {
  const { loading, events } = useTodayEvents(kresId);
  return (
    <CardShell
      title="Bugünkü Etkinlik"
      icon={<CalendarOutlined />}
      color={THEME.teal}
      loading={loading}
      empty={!events.length}
      emptyText="Bugün planlı etkinlik yok"
      onSeeAll={() => navigate('/etkinlikler')}
    >
      {events.map((e) => (
        <div key={e.id} style={{ marginBottom: 8 }}>
          <Text strong style={{ fontSize: 12.5, display: 'block' }}>{e.baslik || 'Etkinlik'}</Text>
          {e.saat && <Text type="secondary" style={{ fontSize: 11 }}>{e.saat}</Text>}
        </div>
      ))}
    </CardShell>
  );
}

// Dashboard'daki "Genel Özet"in altına eklenen Günlük Özet şeridi —
// bugünkü yoklama (sınıf bazlı geldi/gelmedi + gelmeyen isimleri),
// bugünkü menü ve bugünkü etkinliği tek satırda özetler. Kullanıcıyla
// sohbette konuşulan sıralama: yoklama en geniş kart, menü ve etkinlik
// yanında daha küçük ikişer kart.
export default function DailySummary({ navigate, kresId }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <Title level={5} style={{ marginBottom: 12 }}>Günlük Özet</Title>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <AttendanceCard navigate={navigate} kresId={kresId} />
        <MealCard navigate={navigate} kresId={kresId} />
        <EventCard navigate={navigate} kresId={kresId} />
      </div>
    </div>
  );
}
