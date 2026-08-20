import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Tabs, Row, Col, Card, Progress, Tag, Spin, Empty, Statistic } from 'antd';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import {
  NODE_KEYS,
  KRES_FILTERED_NODES,
  toList,
  buildStatistics,
  formatTL,
  formatDateTimeTr,
} from '../utils/statisticsHelpers';

const { Title, Text, Paragraph } = Typography;

// Mobildeki AdminStatisticsScreen.js'in web karşılığı — aynı veri mantığı
// (bkz. src/utils/statisticsHelpers.js), UI antd bileşenleriyle kuruldu.
export default function StatisticsPage() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId || 'kres001';
  const [raw, setRaw] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loaded = {};
    setLoading(true);

    const unsubscribers = NODE_KEYS.map((node) => {
      const target = KRES_FILTERED_NODES.has(node)
        ? query(ref(database, node), orderByChild('kresId'), equalTo(kresId))
        : ref(database, node);

      return onValue(
        target,
        (snap) => {
          if (!mounted) return;
          loaded[node] = true;
          setRaw((prev) => ({ ...prev, [node]: toList(snap.val()) }));
          if (NODE_KEYS.every((key) => loaded[key])) setLoading(false);
        },
        () => {
          loaded[node] = true;
          if (mounted) {
            setRaw((prev) => ({ ...prev, [node]: [] }));
            if (NODE_KEYS.every((key) => loaded[key])) setLoading(false);
          }
        }
      );
    });

    return () => {
      mounted = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe && unsubscribe());
    };
  }, [kresId]);

  const stats = useMemo(() => buildStatistics(raw, kresId), [raw, kresId]);

  const items = [
    { key: 'genel', label: 'Genel', children: <GeneralTab stats={stats} /> },
    { key: 'ogretmen', label: 'Öğretmenler', children: <TeacherTab teachers={stats.teacherStats} /> },
    { key: 'cocuk', label: 'Çocuklar', children: <ChildrenTab childList={stats.childStats} /> },
    { key: 'risk', label: 'Riskler', children: <RiskTab riskGroups={stats.riskGroups} /> },
    { key: 'aktivite', label: 'Aktivite', children: <ActivityTab entries={stats.activityLog} /> },
  ];

  return (
    <div>
      <div
        style={{
          background: THEME.primary,
          borderRadius: 20,
          padding: '20px 24px',
          marginBottom: 20,
        }}
      >
        <Title level={3} style={{ color: '#fff', margin: 0 }}>📊 Kurum İstatistikleri</Title>
        <Text style={{ color: 'rgba(255,255,255,0.82)' }}>
          Genel gidişat, öğretmen kullanımı ve çocuk bazlı risk analizi
        </Text>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
          <Paragraph type="secondary" style={{ marginTop: 12 }}>İstatistikler hazırlanıyor...</Paragraph>
        </div>
      ) : (
        <Tabs items={items} />
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return <Title level={5} style={{ marginTop: 4, marginBottom: 12 }}>{children}</Title>;
}

function StatBlock({ icon, value, label, color }) {
  return (
    <Card size="small" style={{ textAlign: 'center', borderColor: THEME.border }}>
      <div style={{ fontSize: 26 }}>{icon}</div>
      <Statistic value={value} valueStyle={{ color, fontWeight: 900, fontSize: 22 }} />
      <Text type="secondary" style={{ fontWeight: 700, fontSize: 12 }}>{label}</Text>
    </Card>
  );
}

function ProgressLine({ label, percent: value, color }) {
  const safePercent = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontWeight: 700, fontSize: 13 }}>{label}</Text>
        <Text type="secondary" style={{ fontWeight: 800, fontSize: 12 }}>%{safePercent}</Text>
      </div>
      <Progress percent={safePercent} showInfo={false} strokeColor={color} trailColor="#F1EEF9" />
    </div>
  );
}

function GeneralTab({ stats }) {
  return (
    <>
      <SectionTitle>Kurum Genel Durum</SectionTitle>
      <Row gutter={[12, 12]} style={{ marginBottom: 8 }}>
        <Col xs={12} md={6}><StatBlock icon="👶" value={stats.totalChildren} label="Toplam çocuk" color={THEME.orange} /></Col>
        <Col xs={12} md={6}><StatBlock icon="👨‍🏫" value={stats.totalTeachers} label="Öğretmen" color={THEME.primary} /></Col>
        <Col xs={12} md={6}><StatBlock icon="👨‍👩‍👧" value={stats.totalParents} label="Veli" color={THEME.green} /></Col>
        <Col xs={12} md={6}><StatBlock icon="🏫" value={stats.totalClasses} label="Sınıf" color={THEME.blue} /></Col>
      </Row>

      <Card style={{ marginBottom: 14, borderColor: THEME.border }} title="📅 Bugünkü Yoklama">
        <ProgressLine label={`${stats.todayPresent} gelen / ${stats.todayAttendanceTotal} kayıt`} percent={stats.todayAttendanceRate} color={THEME.green} />
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>Bugün gelmeyen çocuk: {stats.todayAbsent}</Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>Bugün girilen günlük rapor: {stats.todayReportCount}</Paragraph>
      </Card>

      <Card style={{ marginBottom: 14, borderColor: THEME.border }} title="💰 Bu Ay Ödeme Durumu">
        <ProgressLine label={`Tahsilat oranı: %${stats.paymentCollectionRate}`} percent={stats.paymentCollectionRate} color={THEME.gold} />
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>Ödenen: {formatTL(stats.paidAmount)}</Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>Bekleyen / geciken: {formatTL(stats.pendingAmount)}</Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>Bekleyen ödeme kaydı: {stats.pendingPaymentCount}</Paragraph>
      </Card>

      <Card style={{ borderColor: THEME.border }} title="🔔 Veli Etkileşimi">
        <ProgressLine label={`Anket cevabı: ${stats.pollAnswerCount}`} percent={Math.min(100, stats.pollAnswerCount * 10)} color={THEME.purple} />
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>Aktif anket: {stats.activePollCount}</Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>Kurum zili bildirimi: {stats.bellCount}</Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>Bekleyen kurum zili: {stats.pendingBellCount}</Paragraph>
      </Card>
    </>
  );
}

function TeacherTab({ teachers }) {
  if (!teachers.length) {
    return <EmptyBlock icon="👨‍🏫" title="Öğretmen istatistiği yok" desc="Bu kurum için öğretmen veya öğretmen raporu bulunamadı." />;
  }

  return (
    <>
      <SectionTitle>Öğretmen / Sınıf Kullanımı</SectionTitle>
      {teachers.map((teacher) => (
        <Card key={teacher.id} style={{ marginBottom: 14, borderColor: THEME.border }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <Text strong>{teacher.name}</Text>
              <div><Text type="secondary">{teacher.classNames || 'Sınıf bilgisi yok'}</Text></div>
            </div>
            <Tag color="purple">{teacher.childCount} çocuk</Tag>
          </div>
          <ProgressLine label={`Bu ay günlük rapor: ${teacher.reportCount}`} percent={Math.min(100, teacher.reportCount * 5)} color={THEME.primary} />
          <ProgressLine label={`Yoklama düzeni: %${teacher.attendanceRate}`} percent={teacher.attendanceRate} color={THEME.green} />
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>Etkinlik kaydı: {teacher.eventCount}</Paragraph>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Eksik rapor uyarısı: {teacher.reportCount < 5 ? 'Takip edilmeli' : 'Normal görünüyor'}
          </Paragraph>
        </Card>
      ))}
    </>
  );
}

function ChildrenTab({ childList }) {
  if (!childList.length) {
    return <EmptyBlock icon="👶" title="Çocuk istatistiği yok" desc="Bu kurum için çocuk kaydı bulunamadı." />;
  }

  return (
    <>
      <SectionTitle>Çocuk Bazlı Gelişim ve Risk</SectionTitle>
      {childList.map((child) => (
        <Card key={child.id} style={{ marginBottom: 14, borderColor: THEME.border }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <Text strong>{child.name}</Text>
              <div><Text type="secondary">{child.className || 'Sınıf bilgisi yok'}</Text></div>
            </div>
            <RiskBadge riskCount={child.risks.length} />
          </div>

          <ProgressLine label={`Devam oranı: %${child.attendanceRate}`} percent={child.attendanceRate} color={child.attendanceRate < 80 ? THEME.red : THEME.green} />
          <ProgressLine label={`Yemek iyi: %${child.mealGoodRate}`} percent={child.mealGoodRate} color={child.mealGoodRate < 65 ? THEME.orange : THEME.green} />
          <ProgressLine label={`Etkinlik katılımı: %${child.eventJoinRate}`} percent={child.eventJoinRate} color={child.eventJoinRate < 70 ? THEME.red : THEME.purple} />

          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>Uyku: {child.sleepSummary}</Paragraph>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>Ruh hali: {child.moodSummary}</Paragraph>
          <Paragraph type="secondary" style={{ marginBottom: 8 }}>Yorum: {child.comment}</Paragraph>

          <div>
            {child.risks.length
              ? child.risks.map((risk) => <Tag color="red" key={risk} style={{ marginBottom: 4 }}>{risk}</Tag>)
              : <Tag color="green">Belirgin risk yok</Tag>}
          </div>
        </Card>
      ))}
    </>
  );
}

function RiskTab({ riskGroups }) {
  const groupList = [
    { key: 'meal', title: '🍽️ Yemek Takibi Gerekenler', empty: 'Yemek tarafında belirgin risk yok.' },
    { key: 'event', title: '🎨 Etkinlik Katılımı Düşük', empty: 'Etkinlik katılımı genel olarak iyi.' },
    { key: 'attendance', title: '📅 Devamsızlık Dikkat', empty: 'Devamsızlıkta belirgin risk yok.' },
    { key: 'mood', title: '😟 Ruh Hali Takibi', empty: 'Ruh hali tarafında belirgin risk yok.' },
    { key: 'sleep', title: '😴 Uyku Takibi', empty: 'Uyku tarafında belirgin risk yok.' },
  ];

  return (
    <>
      <SectionTitle>Risk Listesi</SectionTitle>
      {groupList.map((group) => (
        <Card key={group.key} style={{ marginBottom: 14, borderColor: THEME.border }} title={group.title}>
          {riskGroups[group.key].length ? (
            riskGroups[group.key].map((item, index) => (
              <div
                key={`${group.key}-${item.id}`}
                style={{
                  padding: '10px 0',
                  borderTop: index === 0 ? 'none' : `1px solid ${THEME.border}`,
                }}
              >
                <Text strong>{item.name}</Text>
                <div><Text type="secondary">{item.reason}</Text></div>
              </div>
            ))
          ) : (
            <Text type="secondary">{group.empty}</Text>
          )}
        </Card>
      ))}
    </>
  );
}

function ActivityTab({ entries }) {
  if (!entries.length) {
    return <EmptyBlock icon="🕓" title="Aktivite kaydı yok" desc="Öğretmenler bilgi girdikçe burada kim, ne zaman, ne girdi görünecek." />;
  }

  return (
    <>
      <SectionTitle>Öğretmen Giriş Kayıtları</SectionTitle>
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Hangi öğretmenin hangi bilgiyi hangi saatte girdiğini gösterir (son {entries.length} kayıt).
      </Paragraph>
      <Card style={{ borderColor: THEME.border }}>
        {entries.map((entry, index) => (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 0',
              borderBottom: index === entries.length - 1 ? 'none' : `1px solid ${THEME.border}`,
            }}
          >
            <div style={{ fontSize: 18 }}>{entry.icon}</div>
            <div style={{ flex: 1 }}>
              <Text strong>{entry.detail}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {entry.teacherName} · {entry.nodeLabel} · {formatDateTimeTr(entry.time)}
                </Text>
              </div>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}

function RiskBadge({ riskCount }) {
  const hasRisk = riskCount > 0;
  return <Tag color={hasRisk ? 'red' : 'green'}>{hasRisk ? `${riskCount} risk` : 'Normal'}</Tag>;
}

function EmptyBlock({ icon, title, desc }) {
  return (
    <Card style={{ textAlign: 'center', padding: 20, borderColor: THEME.border }}>
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
            <Text strong>{title}</Text>
            <div><Text type="secondary">{desc}</Text></div>
          </div>
        }
      />
    </Card>
  );
}
