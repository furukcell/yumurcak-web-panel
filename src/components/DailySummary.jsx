import React, { useEffect, useState } from 'react';
import { Card, Typography, Spin, Empty, Progress, Tag } from 'antd';
import { CheckSquareOutlined, CoffeeOutlined, CalendarOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { todayDateKey } from '../services/monthlyDocuments';
import { toList, filterByKres, getChildId, isAbsentStatus, isSameDay, extractDate, getName, findClassName } from '../utils/statisticsHelpers';
import { THEME, cardStyle } from '../theme';
import { useTranslation } from 'react-i18next';

const { Text, Title } = Typography;

// "Bugünkü Yoklama" — Genel Özet'in altındaki Günlük Özet şeridindeki ana
// kart. Öğretmenlerin kendi tarafında girdiği 'yoklamalar' node'unu
// SADECE okur, admin panelden yoklama girişi YAPILMAZ — bkz. sohbet notu.
// Sınıf bazlı geldi/gelmedi kırılımı + gelmeyen çocukların isim listesi.
function useTodayAttendance(kresId) {
  const { t, i18n } = useTranslation();
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
          classGroups.set(classId, { classId, className: className || t('dashboard.classless'), total: 0, present: 0, absentChildren: [] });
        }
        return classGroups.get(classId);
      };

      children.forEach((child) => {
        const classId = child.sinifId || child.classId || '_none';
        const className = classId === '_none' ? t('dashboard.classless') : findClassName(classes, classId);
        const group = addToGroup(classId, className);
        group.total += 1;
        const record = byChild.get(child.id);
        const geldi = record && !isAbsentStatus(record.durum || record.status);
        if (geldi) group.present += 1;
        else group.absentChildren.push({ id: child.id, name: getName(child, child.adSoyad || t('dashboard.childFallback')), recorded: !!record });
      });

      const groups = Array.from(classGroups.values()).sort((a, b) => a.className.localeCompare(b.className, i18n.language));
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
  }, [kresId, t, i18n.language]);

  return state;
}

// "Bugünkü Menü" — yemekListeleri node'unda tarih=bugün olan kaydı bulur
// (varsa genel/sınıfsız kayıt öncelikli), kahvaltı/öğle/ara öğün özetler.
function useTodayMeal(kresId) {
  const { t } = useTranslation();
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
          { label: t('dashboard.breakfast'), items: ogunler.kahvalti },
          { label: t('dashboard.lunch'), items: ogunler.ogle },
          { label: t('dashboard.snack'), items: ogunler.araOgun },
        ].filter((p) => Array.isArray(p.items) && p.items.length);
        setState({ loading: false, summary: parts.length ? parts : null });
      },
      () => setState({ loading: false, summary: null })
    );
    return unsub;
  }, [kresId, t]);

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
function CardShell({ title, icon, loading, empty, emptyText, onSeeAll, children, tone = 'purple' }) {
  return (
    <div className={`dashboard-daily-card dashboard-daily-card-${tone}`}>
      <div
        className="dashboard-daily-card-head"
        onClick={onSeeAll}
        role={onSeeAll ? 'button' : undefined}
        tabIndex={onSeeAll ? 0 : undefined}
      >
        <div className="dashboard-daily-card-title">
          <span className="dashboard-daily-card-icon">{icon}</span>
          <Text strong>{title}</Text>
        </div>
        {onSeeAll && <span className="dashboard-daily-card-arrow">›</span>}
      </div>
      <div className="dashboard-daily-card-body">
        {loading ? (
          <div className="dashboard-daily-loading"><Spin size="small" /></div>
        ) : empty ? (
          <Empty
            description={<Text type="secondary" className="dashboard-daily-empty-text">{emptyText}</Text>}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            className="dashboard-daily-empty"
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function AttendanceCard({ navigate, kresId }) {
  const { t } = useTranslation();
  const { loading, classes, present, total } = useTodayAttendance(kresId);
  const [openClassId, setOpenClassId] = useState(null);
  const absent = total - present;
  const rate = total ? Math.round((present / total) * 100) : 0;

  return (
    <CardShell
      title={t('dashboard.attendance')}
      icon={<CheckSquareOutlined />}
      tone="purple"
      loading={loading}
      empty={!total}
      emptyText={t('dashboard.noChildren')}
      onSeeAll={() => navigate('/istatistik')}
    >
      <div className="dashboard-attendance-overview">
        <Progress type="circle" percent={rate} size={48} strokeColor="#6c3deb" format={() => `${present}/${total}`} />
        <div>
          <Text strong className="dashboard-daily-main-value">{present} {t('dashboard.present')}</Text>
          <Text type="secondary" className="dashboard-daily-secondary-value">{absent} {t('dashboard.absent')}</Text>
        </div>
      </div>
      <div className="dashboard-attendance-list">
        {classes.map((group) => {
          const isOpen = openClassId === group.classId;
          return (
            <div key={group.classId} className="dashboard-attendance-row">
              <div
                className="dashboard-attendance-row-main"
                onClick={() => group.absentChildren.length && setOpenClassId(isOpen ? null : group.classId)}
              >
                <Text className="dashboard-attendance-class">{group.className}</Text>
                <div className="dashboard-attendance-count">
                  <Text type="secondary">{group.present}/{group.total} {t('dashboard.present')}</Text>
                  {group.absentChildren.length > 0 && (isOpen ? <UpOutlined /> : <DownOutlined />)}
                </div>
              </div>
              {isOpen && (
                <div className="dashboard-attendance-absent">
                  {group.absentChildren.map((child) => (
                    <Tag key={child.id} color={child.recorded ? THEME.red : undefined}>
                      {child.name}{!child.recorded ? ` · ${t('dashboard.notEntered')}` : ''}
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
  const { t } = useTranslation();
  const { loading, summary } = useTodayMeal(kresId);
  return (
    <CardShell
      title={t('dashboard.meal')}
      icon={<CoffeeOutlined />}
      tone="orange"
      loading={loading}
      empty={!summary}
      emptyText={t('dashboard.noMeal')}
      onSeeAll={() => navigate('/yemek-listesi')}
    >
      {summary && (
        <div className="dashboard-meal-list">
          {summary.map((part) => (
            <div key={part.label} className="dashboard-meal-row">
              <Text type="secondary">{part.label}</Text>
              <Text>{part.items.join(', ')}</Text>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

function EventCard({ navigate, kresId }) {
  const { t } = useTranslation();
  const { loading, events } = useTodayEvents(kresId);
  return (
    <CardShell
      title={t('dashboard.event')}
      icon={<CalendarOutlined />}
      tone="green"
      loading={loading}
      empty={!events.length}
      emptyText={t('dashboard.noEvent')}
      onSeeAll={() => navigate('/etkinlikler')}
    >
      <div className="dashboard-event-list">
        {events.map((e) => (
          <div key={e.id} className="dashboard-event-item">
            <span className="dashboard-event-date">{e.tarih ? String(e.tarih).slice(8, 10) : '—'}</span>
            <div>
              <Text strong>{e.baslik || t('dashboard.eventFallback')}</Text>
              {e.saat && <Text type="secondary">{e.saat}</Text>}
            </div>
          </div>
        ))}
      </div>
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
    <div className="dashboard-daily-grid">
      <AttendanceCard navigate={navigate} kresId={kresId} />
      <MealCard navigate={navigate} kresId={kresId} />
      <EventCard navigate={navigate} kresId={kresId} />
    </div>
  );
}
