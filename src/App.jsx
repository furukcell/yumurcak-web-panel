import React, { useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import trTR from 'antd/locale/tr_TR';
import { AuthProvider, useAuth } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { THEME, applyKresTheme } from './theme';
import { getThemeById } from './theme/themes';
import LoginPage from './pages/LoginPage';
import PanelLayout from './components/PanelLayout';
import DashboardPage from './pages/DashboardPage';
import StatisticsPage from './pages/StatisticsPage';
import ClassesPage from './pages/ClassesPage';
import BulkOnboardingPage from './pages/BulkOnboardingPage';
import ChildrenPage from './pages/ChildrenPage';
import TeachersPage from './pages/TeachersPage';
import AdministratorsPage from './pages/AdministratorsPage';
import ParentsPage from './pages/ParentsPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import EventsPage from './pages/EventsPage';
import GalleryPage from './pages/GalleryPage';
import PollsPage from './pages/PollsPage';
import MessagesPage from './pages/MessagesPage';
import MealsPage from './pages/MealsPage';
import SchedulePage from './pages/SchedulePage';
import DutyRosterPage from './pages/DutyRosterPage';
import StaffTasksPage from './pages/StaffTasksPage';
import ServicePage from './pages/ServicePage';
import BirthdayCalendarPage from './pages/BirthdayCalendarPage';
import PaymentsPage from './pages/PaymentsPage';
import InstitutionSettingsPage from './pages/InstitutionSettingsPage';
import ThemePage from './pages/ThemePage';
import SubscriptionPage from './pages/SubscriptionPage';
import BellPage from './pages/BellPage';
import LegalDocumentsPage from './pages/LegalDocumentsPage';
import AuditLogPage from './pages/AuditLogPage';
import SuperAdminLayout from '../superadmin/SuperAdminLayout';
import SuperAdminDashboard from '../superadmin/SuperAdminDashboard';
import SuperAdminKresler from '../superadmin/SuperAdminKresler';
import SuperAdminKresDetail from '../superadmin/SuperAdminKresDetail';
import SuperAdminAnalytics from '../superadmin/SuperAdminAnalytics';

function Gate() {
  const { kullanici, yukleniyor } = useAuth();
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  if (yukleniyor) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>;
  if (!kullanici) return <Routes><Route path="*" element={<LoginPage />} /></Routes>;

  const b = (element) => <ErrorBoundary resetKey={location.pathname}>{element}</ErrorBoundary>;

  if (kullanici.rol === 'superadmin') {
    return <Routes>
      <Route path="/superadmin" element={<SuperAdminLayout />}>
        <Route index element={b(<SuperAdminDashboard />)} />
        <Route path="kresler" element={b(<SuperAdminKresler />)} />
        <Route path="kresler/:id" element={b(<SuperAdminKresDetail />)} />
        <Route path="analytics" element={b(<SuperAdminAnalytics />)} />
        <Route path="abonelikler" element={<div style={{ padding: 24 }}>Abonelik yönetimi bir sonraki adımda eklenecek.</div>} />
        <Route path="*" element={<Navigate to="/superadmin" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/superadmin" replace />} />
    </Routes>;
  }

  return <Routes>
    <Route element={<PanelLayout />}>
      <Route path="/" element={b(<DashboardPage />)} />
      <Route path="/istatistik" element={b(<StatisticsPage />)} />
      <Route path="/siniflar" element={b(<ClassesPage />)} />
      <Route path="/toplu-kurulum" element={b(<BulkOnboardingPage />)} />
      <Route path="/cocuklar" element={b(<ChildrenPage />)} />
      <Route path="/ogretmenler" element={b(<TeachersPage />)} />
      <Route path="/yoneticiler" element={b(<AdministratorsPage />)} />
      <Route path="/veliler" element={b(<ParentsPage />)} />
      <Route path="/duyurular" element={b(<AnnouncementsPage />)} />
      <Route path="/etkinlikler" element={b(<EventsPage />)} />
      <Route path="/galeri" element={b(<GalleryPage />)} />
      <Route path="/anketler" element={b(<PollsPage />)} />
      <Route path="/mesajlar" element={b(<MessagesPage />)} />
      <Route path="/yemek-listesi" element={b(<MealsPage />)} />
      <Route path="/ders-programi" element={b(<SchedulePage />)} />
      <Route path="/nobet-cizelgesi" element={b(<DutyRosterPage />)} />
      <Route path="/personel-gorevleri" element={b(<StaffTasksPage />)} />
      <Route path="/servis" element={b(<ServicePage />)} />
      <Route path="/dogum-gunleri" element={b(<BirthdayCalendarPage />)} />
      <Route path="/odemeler" element={b(<PaymentsPage />)} />
      <Route path="/ayarlar/kurum" element={b(<InstitutionSettingsPage />)} />
      <Route path="/ayarlar/tema" element={b(<ThemePage />)} />
      <Route path="/ayarlar/abonelik" element={b(<SubscriptionPage />)} />
      <Route path="/ayarlar/kurum-zili" element={b(<BellPage />)} />
      <Route path="/yasal-belgeler" element={b(<LegalDocumentsPage />)} />
      <Route path="/denetim-kaydi" element={b(<AuditLogPage />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>;
}

function ThemedApp() {
  const { kres } = useAuth();
  const activeTheme = useMemo(() => getThemeById(kres?.temaId), [kres?.temaId]);
  useEffect(() => { applyKresTheme(kres?.temaId); }, [kres?.temaId]);
  return <ConfigProvider locale={trTR} theme={{
    token: { colorPrimary: activeTheme.primary, colorLink: activeTheme.primary, colorBgLayout: activeTheme.bg, borderRadius: THEME.radiusSm, borderRadiusLG: THEME.radius, fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
    components: {
      Card: { borderRadiusLG: THEME.radius, boxShadowTertiary: THEME.shadow },
      Button: { borderRadius: 10, controlHeight: 38, fontWeight: 600 },
      Menu: { itemBorderRadius: 12, itemSelectedBg: activeTheme.primarySoft, itemSelectedColor: activeTheme.primaryDark, itemHoverBg: '#F5F2FF', itemHeight: 42, iconSize: 17 },
      Table: { borderRadiusLG: THEME.radius, headerBg: '#FAF9FF' },
      Input: { borderRadius: THEME.radiusSm, controlHeight: 38 },
      Select: { borderRadius: THEME.radiusSm, controlHeight: 38 },
      Tag: { borderRadiusSM: 999 },
      Drawer: { borderRadiusLG: THEME.radius },
    },
  }}><Gate /></ConfigProvider>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><ThemedApp /></AuthProvider></BrowserRouter>;
}
