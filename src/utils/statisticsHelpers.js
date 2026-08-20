// Mobildeki src/screens/admin/AdminStatisticsScreen.js dosyasındaki saf
// (React Native'e bağımlı olmayan) hesaplama mantığının birebir web
// karşılığı. UI kısmı yok — sadece veri işleme fonksiyonları.
// Kaynakla senkron tutulmalı: mobil tarafta bu mantık değişirse buraya da
// yansıtılmalı (bkz. docs/web-panel-plan.md).

export const NODE_KEYS = [
  'cocuklar',
  'kullanicilar',
  'siniflar',
  'yoklamalar',
  'gunlukRaporlar',
  'odemeler',
  'anketler',
  'kurumZili',
  'etkinlikler',
  'yemekListeleri',
  'duyurular',
  'ilacTakipFormlari',
  'medikalBilgiler',
];

// Bu düğümlerin Firebase kuralı, filtresiz tam okumayı reddedip sadece
// orderByChild('kresId').equalTo(...) sorgusuna izin veriyor (bkz. mobil
// database.rules.json). Web tarafında da aynı sorgu şekli kullanılmalı.
export const KRES_FILTERED_NODES = new Set([
  'cocuklar',
  'siniflar',
  'yoklamalar',
  'gunlukRaporlar',
  'etkinlikler',
  'yemekListeleri',
  'duyurular',
  'ilacTakipFormlari',
  'medikalBilgiler',
]);

// Yönetici Aktivite Geçmişi — hangi öğretmenin hangi bilgiyi hangi saatte
// girdiğini gösteren log.
export const ACTIVITY_NODE_CONFIG = [
  { key: 'yoklamalar', icon: '📅', label: 'Yoklama', describe: (item, ctx) => `${ctx.childName(item.cocukId)} için yoklama girildi` },
  { key: 'gunlukRaporlar', icon: '📝', label: 'Günlük Rapor', describe: (item, ctx) => `${ctx.childName(item.cocukId)} için günlük rapor girildi` },
  { key: 'etkinlikler', icon: '🎨', label: 'Etkinlik', describe: (item) => (item.baslik ? `"${item.baslik}" etkinliği girildi` : 'Etkinlik girildi') },
  { key: 'yemekListeleri', icon: '🍽️', label: 'Yemek Listesi', describe: () => 'Yemek listesi girildi' },
  { key: 'duyurular', icon: '📢', label: 'Duyuru', describe: (item) => (item.baslik ? `"${item.baslik}" duyurusu girildi` : 'Duyuru girildi') },
  { key: 'ilacTakipFormlari', icon: '💊', label: 'İlaç Takip', describe: (item, ctx) => `${ctx.childName(item.cocukId)} için "${item.ilacAdi || 'ilaç'}" takip formu girildi` },
  { key: 'medikalBilgiler', icon: '🩺', label: 'Medikal Bilgi', describe: (item, ctx) => `${ctx.childName(item.cocukId)} için medikal bilgi güncellendi` },
];

export function getEntererId(item) {
  return item.ogretmenId || item.teacherId || item.guncelleyenOgretmenId || item.olusturanId || item.createdBy || null;
}

export function getEntererTime(item) {
  const value = item.updatedAt || item.createdAt;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function toList(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).map(([id, item]) => ({ id, ...(item && typeof item === 'object' ? item : {}) }));
}

export function filterByKres(list = [], kresId) {
  return list.filter((item) => !item.kresId || item.kresId === kresId || item.kurumId === kresId || item.institutionId === kresId);
}

export function getRole(item) {
  return normalizeText(item.rol || item.role || item.kullaniciTipi || item.type);
}

export function getName(item, fallback) {
  const full = `${item.ad || item.name || ''} ${item.soyad || item.surname || ''}`.trim();
  return full || item.adSoyad || item.fullName || item.kullaniciAdi || item.displayName || fallback;
}

export function getChildId(item) {
  return item.cocukId || item.childId || item.ogrenciId || item.studentId;
}

export function findClassName(classes, classId) {
  if (!classId) return '';
  const found = classes.find((item) => item.id === classId);
  return found?.ad || found?.sinifAdi || found?.name || '';
}

export function getAmount(item) {
  const value = item.tutar ?? item.amount ?? item.ucret ?? item.price ?? 0;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

export function isPaidStatus(value) {
  const text = normalizeText(value);
  return text.includes('odendi') || text.includes('ödendi') || text.includes('paid') || text.includes('tamamlandi');
}

export function isAbsentStatus(value) {
  const text = normalizeText(value);
  return text.includes('gelmedi') || text.includes('yok') || text.includes('absent') || text.includes('izin');
}

export function isBadValue(value) {
  if (value === false) return true;
  const text = normalizeText(value);
  return (
    text.includes('yemedi') ||
    text.includes('az') ||
    text.includes('kotu') ||
    text.includes('kötü') ||
    text.includes('hayir') ||
    text.includes('hayır') ||
    text.includes('katilmadi') ||
    text.includes('katılmadı') ||
    text.includes('uyumadi') ||
    text.includes('uyumadı')
  );
}

export function countAnswers(item) {
  const answers = item.cevaplar || item.answers || item.responses;
  if (!answers || typeof answers !== 'object') return 0;
  return Object.keys(answers).length;
}

export function percent(part, total) {
  if (!total) return 0;
  return Math.round((Number(part || 0) / Number(total || 0)) * 100);
}

export function getDateKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getMonthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function extractDate(value) {
  return value.tarih || value.date || value.gun || value.createdAt || value.updatedAt || value.zaman;
}

export function isSameDay(item, todayKey) {
  const value = extractDate(item);
  if (!value) return false;
  if (typeof value === 'number') return getDateKey(value) === todayKey;
  return String(value).startsWith(todayKey);
}

export function isInMonth(item, monthKey) {
  const value = extractDate(item);
  if (!value) return false;
  if (typeof value === 'number') return getMonthKey(value) === monthKey;
  return String(value).startsWith(monthKey);
}

export function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase('tr-TR');
}

export function readableMood(value) {
  if (value.includes('mutlu')) return 'Mutlu';
  if (value.includes('huzursuz')) return 'Huzursuz';
  if (value.includes('üzgün') || value.includes('uzgun')) return 'Üzgün';
  if (value.includes('yorgun')) return 'Yorgun';
  if (value.includes('sakin')) return 'Sakin';
  if (value.includes('normal')) return 'Normal';
  return value || 'Kayıt yok';
}

export function formatDateTimeTr(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatTL(value) {
  const number = Number(value || 0);
  return `${Math.round(number).toLocaleString('tr-TR')} TL`;
}

export function buildStatistics(raw, kresId) {
  const children = filterByKres(raw.cocuklar, kresId);
  const users = filterByKres(raw.kullanicilar, kresId);
  const classes = filterByKres(raw.siniflar, kresId);
  const attendance = filterByKres(raw.yoklamalar, kresId);
  const reports = filterByKres(raw.gunlukRaporlar, kresId);
  const payments = filterByKres(raw.odemeler, kresId);
  const polls = filterByKres(raw.anketler, kresId);
  const bells = filterByKres(raw.kurumZili, kresId);
  const events = filterByKres(raw.etkinlikler, kresId);

  const todayKey = getDateKey(new Date());
  const monthKey = getMonthKey(new Date());
  const monthAttendance = attendance.filter((item) => isInMonth(item, monthKey));
  const todayAttendance = attendance.filter((item) => isSameDay(item, todayKey));
  const todayPresent = todayAttendance.filter((item) => !isAbsentStatus(item.durum || item.status)).length;
  const todayAbsent = todayAttendance.filter((item) => isAbsentStatus(item.durum || item.status)).length;

  const monthPayments = payments.filter((item) => isInMonth(item, monthKey));
  const paidPayments = monthPayments.filter((item) => isPaidStatus(item.durum || item.status));
  const pendingPayments = monthPayments.filter((item) => !isPaidStatus(item.durum || item.status));
  const paidAmount = paidPayments.reduce((sum, item) => sum + getAmount(item), 0);
  const pendingAmount = pendingPayments.reduce((sum, item) => sum + getAmount(item), 0);

  const childStats = children.map((child) => buildChildStats(child, { classes, reports, attendance: monthAttendance, events, monthKey }));
  const teacherStats = buildTeacherStats(users, classes, children, reports, monthAttendance, events);
  const riskGroups = buildRiskGroups(childStats);
  const activityLog = buildActivityLog(raw, users, children, kresId);

  return {
    totalChildren: children.length,
    totalTeachers: users.filter((u) => getRole(u) === 'ogretmen').length,
    totalParents: users.filter((u) => getRole(u) === 'veli').length,
    totalClasses: classes.length,
    todayPresent,
    todayAbsent,
    todayAttendanceTotal: todayAttendance.length,
    todayAttendanceRate: percent(todayPresent, todayAttendance.length),
    todayReportCount: reports.filter((item) => isSameDay(item, todayKey)).length,
    paidAmount,
    pendingAmount,
    pendingPaymentCount: pendingPayments.length,
    paymentCollectionRate: percent(paidAmount, paidAmount + pendingAmount),
    activePollCount: polls.filter((item) => item.aktif !== false).length,
    pollAnswerCount: polls.reduce((sum, item) => sum + countAnswers(item), 0),
    bellCount: bells.filter((item) => isInMonth(item, monthKey)).length,
    pendingBellCount: bells.filter((item) => !item.tamamlandi && item.status !== 'tamamlandi').length,
    childStats,
    teacherStats,
    riskGroups,
    activityLog,
  };
}

function buildActivityLog(raw, users, children, kresId) {
  const childName = (childId) => {
    const child = children.find((item) => item.id === childId);
    if (!child) return 'Çocuk';
    return getName(child, child.adSoyad || child.ad || 'Çocuk');
  };
  const ctx = { childName };

  const entries = [];
  ACTIVITY_NODE_CONFIG.forEach((config) => {
    const list = filterByKres(raw[config.key], kresId);
    list.forEach((item) => {
      const entererId = getEntererId(item);
      const time = getEntererTime(item);
      if (!entererId || !time) return;
      const teacher = users.find((user) => user.id === entererId && getRole(user) === 'ogretmen');
      if (!teacher) return;
      entries.push({
        id: `${config.key}-${item.id}`,
        icon: config.icon,
        nodeLabel: config.label,
        teacherName: getName(teacher, 'İsimsiz öğretmen'),
        detail: config.describe(item, ctx),
        time,
      });
    });
  });

  return entries.sort((a, b) => b.time - a.time).slice(0, 80);
}

function buildChildStats(child, context) {
  const childId = child.id;
  const childReports = context.reports.filter((item) => getChildId(item) === childId && isInMonth(item, context.monthKey));
  const childAttendance = context.attendance.filter((item) => getChildId(item) === childId && isInMonth(item, context.monthKey));
  const present = childAttendance.filter((item) => !isAbsentStatus(item.durum || item.status)).length;
  const absent = childAttendance.filter((item) => isAbsentStatus(item.durum || item.status)).length;

  const meal = buildMealStats(childReports);
  const event = buildEventStats(childReports);
  const sleep = buildSleepStats(childReports);
  const mood = buildMoodStats(childReports);

  const risks = [];
  if (childAttendance.length >= 3 && percent(absent, childAttendance.length) >= 20) risks.push('Devam');
  if (meal.total >= 3 && percent(meal.bad, meal.total) >= 35) risks.push('Yemek');
  if (event.total >= 3 && percent(event.bad, event.total) >= 30) risks.push('Etkinlik');
  if (mood.total >= 3 && percent(mood.negative, mood.total) >= 30) risks.push('Ruh hali');
  if (sleep.total >= 3 && percent(sleep.bad, sleep.total) >= 30) risks.push('Uyku');

  const className = findClassName(context.classes, child.sinifId || child.classId);
  const name = getName(child, 'İsimsiz çocuk');

  return {
    id: childId,
    name,
    className,
    attendanceRate: percent(present, childAttendance.length),
    absent,
    mealGoodRate: percent(meal.good, meal.total),
    eventJoinRate: percent(event.good, event.total),
    sleepSummary: sleep.total ? `${sleep.good} iyi / ${sleep.bad} takip` : 'Kayıt yok',
    moodSummary: mood.total ? `${mood.topLabel} ağırlıklı` : 'Kayıt yok',
    risks,
    riskReasons: {
      meal: `${meal.bad} öğün az/yemedi`,
      event: `${event.bad} etkinlikte düşük katılım`,
      attendance: `${absent} gün devamsızlık`,
      mood: `${mood.negative} gün huzursuz/üzgün`,
      sleep: `${sleep.bad} gün uyku takibi`,
    },
    comment: buildChildComment(name, risks),
  };
}

function buildTeacherStats(users, classes, children, reports, attendance, events) {
  const teachers = users.filter((u) => getRole(u) === 'ogretmen');

  return teachers
    .map((teacher) => {
      const teacherId = teacher.id;
      const teacherClasses = classes.filter(
        (item) => item.ogretmenId === teacherId || item.teacherId === teacherId || item.sorumluOgretmenId === teacherId || item.createdBy === teacherId
      );
      const classIds = teacherClasses.map((item) => item.id);
      const teacherChildren = children.filter((child) => classIds.includes(child.sinifId || child.classId) || child.ogretmenId === teacherId || child.teacherId === teacherId);
      const teacherReports = reports.filter((item) => item.ogretmenId === teacherId || item.teacherId === teacherId || item.createdBy === teacherId || classIds.includes(item.sinifId || item.classId));
      const teacherAttendance = attendance.filter((item) => item.ogretmenId === teacherId || item.teacherId === teacherId || item.createdBy === teacherId || classIds.includes(item.sinifId || item.classId));
      const present = teacherAttendance.filter((item) => !isAbsentStatus(item.durum || item.status)).length;
      const teacherEvents = events.filter((item) => item.ogretmenId === teacherId || item.teacherId === teacherId || item.createdBy === teacherId || classIds.includes(item.sinifId || item.classId));

      return {
        id: teacherId,
        name: getName(teacher, 'İsimsiz öğretmen'),
        classNames: teacherClasses.map((item) => item.ad || item.sinifAdi || item.name).filter(Boolean).join(', '),
        childCount: teacherChildren.length,
        reportCount: teacherReports.length,
        attendanceRate: percent(present, teacherAttendance.length),
        eventCount: teacherEvents.length,
      };
    })
    .sort((a, b) => b.reportCount - a.reportCount);
}

function buildRiskGroups(childStats) {
  return {
    meal: childStats.filter((item) => item.risks.includes('Yemek')).map((item) => ({ id: item.id, name: item.name, reason: item.riskReasons.meal })),
    event: childStats.filter((item) => item.risks.includes('Etkinlik')).map((item) => ({ id: item.id, name: item.name, reason: item.riskReasons.event })),
    attendance: childStats.filter((item) => item.risks.includes('Devam')).map((item) => ({ id: item.id, name: item.name, reason: item.riskReasons.attendance })),
    mood: childStats.filter((item) => item.risks.includes('Ruh hali')).map((item) => ({ id: item.id, name: item.name, reason: item.riskReasons.mood })),
    sleep: childStats.filter((item) => item.risks.includes('Uyku')).map((item) => ({ id: item.id, name: item.name, reason: item.riskReasons.sleep })),
  };
}

function buildMealStats(reports) {
  const keys = ['kahvalti', 'ogle', 'araOgun', 'sabah', 'oglen', 'ikindi'];
  return reports.reduce(
    (acc, item) => {
      keys.forEach((key) => {
        if (item[key] === undefined || item[key] === null || item[key] === '') return;
        acc.total += 1;
        if (isBadValue(item[key])) acc.bad += 1;
        else acc.good += 1;
      });
      return acc;
    },
    { total: 0, good: 0, bad: 0 }
  );
}

function buildEventStats(reports) {
  return reports.reduce(
    (acc, item) => {
      const value = item.etkinlikKatildi ?? item.etkinlikDurumu ?? item.activityStatus ?? item.etkinlik;
      if (value === undefined || value === null || value === '') return acc;
      acc.total += 1;
      if (isBadValue(value) || value === false) acc.bad += 1;
      else acc.good += 1;
      return acc;
    },
    { total: 0, good: 0, bad: 0 }
  );
}

function buildSleepStats(reports) {
  return reports.reduce(
    (acc, item) => {
      const value = item.uyku || item.uykuDurumu || item.sleep || item.uykuSaati;
      if (value === undefined || value === null || value === '') return acc;
      acc.total += 1;
      if (isBadValue(value) || value === false || Number(value) === 0) acc.bad += 1;
      else acc.good += 1;
      return acc;
    },
    { total: 0, good: 0, bad: 0 }
  );
}

function buildMoodStats(reports) {
  const counts = reports.reduce(
    (acc, item) => {
      const mood = normalizeText(item.ruhHali || item.mood || item.genelDurum || item.durum);
      if (!mood) return acc;
      acc.total += 1;
      if (mood.includes('huzursuz') || mood.includes('uzgun') || mood.includes('üzgün') || mood.includes('yorgun')) acc.negative += 1;
      acc.counts[mood] = (acc.counts[mood] || 0) + 1;
      return acc;
    },
    { total: 0, negative: 0, counts: {} }
  );
  const top = Object.entries(counts.counts).sort((a, b) => b[1] - a[1])[0];
  return { ...counts, topLabel: top ? readableMood(top[0]) : 'Kayıt yok' };
}

function buildChildComment(name, risks) {
  if (!risks.length) return `${name} için bu ay belirgin bir risk görünmüyor.`;
  return `${name} için ${risks.join(', ')} alanlarında takip önerilir.`;
}
