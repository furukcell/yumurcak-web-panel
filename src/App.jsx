import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { AuthProvider, useAuth } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './pages/LoginPage';
import PanelLayout from './components/PanelLayout';
import DashboardPage from './pages/DashboardPage';
import StatisticsPage from './pages/StatisticsPage';
import ClassesPage from './pages/ClassesPage';
import ChildrenPage from './pages/ChildrenPage';
import TeachersPage from './pages/TeachersPage';
import AdministratorsPage from './pages/AdministratorsPage';
import ParentsPage from './pages/ParentsPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import EventsPage from './pages/EventsPage';
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

function Gate() {
  const { kullanici, yukleniyor } = useAuth();
  const location = useLocation();

  if (yukleniyor) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!kullanici) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  const b = (element) => <ErrorBoundary resetKey={location.pathname}>{element}</ErrorBoundary>;

  return (
    <Routes>
      <Route element={<PanelLayout />}>
        <Route path="/" element={b(<DashboardPage />)} />
        <Route path="/istatistik" element={b(<StatisticsPage />)} />
        <Route path="/siniflar" element={b(<ClassesPage />)} />
        <Route path="/cocuklar" element={b(<ChildrenPage />)} />
        <Route path="/ogretmenler" element={b(<TeachersPage />)} />
        <Route path="/yoneticiler" element={b(<AdministratorsPage />)} />
        <Route path="/veliler" element={b(<ParentsPage />)} />
        <Route path="/duyurular" element={b(<AnnouncementsPage />)} />
        <Route path="/etkinlikler" element={b(<EventsPage />)} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
