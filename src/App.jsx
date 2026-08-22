import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import PanelLayout from './components/PanelLayout';
import DashboardPage from './pages/DashboardPage';
import StatisticsPage from './pages/StatisticsPage';
import ClassesPage from './pages/ClassesPage';
import ChildrenPage from './pages/ChildrenPage';
import TeachersPage from './pages/TeachersPage';
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

  return (
    <Routes>
      <Route element={<PanelLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/istatistik" element={<StatisticsPage />} />
        <Route path="/siniflar" element={<ClassesPage />} />
        <Route path="/cocuklar" element={<ChildrenPage />} />
        <Route path="/ogretmenler" element={<TeachersPage />} />
        <Route path="/veliler" element={<ParentsPage />} />
        <Route path="/duyurular" element={<AnnouncementsPage />} />
        <Route path="/etkinlikler" element={<EventsPage />} />
        <Route path="/anketler" element={<PollsPage />} />
        <Route path="/mesajlar" element={<MessagesPage />} />
        <Route path="/yemek-listesi" element={<MealsPage />} />
        <Route path="/ders-programi" element={<SchedulePage />} />
        <Route path="/nobet-cizelgesi" element={<DutyRosterPage />} />
        <Route path="/personel-gorevleri" element={<StaffTasksPage />} />
        <Route path="/servis" element={<ServicePage />} />
        <Route path="/dogum-gunleri" element={<BirthdayCalendarPage />} />
        <Route path="/odemeler" element={<PaymentsPage />} />
        <Route path="/ayarlar/kurum" element={<InstitutionSettingsPage />} />
        <Route path="/ayarlar/tema" element={<ThemePage />} />
        <Route path="/ayarlar/abonelik" element={<SubscriptionPage />} />
        <Route path="/ayarlar/kurum-zili" element={<BellPage />} />
        <Route path="/yasal-belgeler" element={<LegalDocumentsPage />} />
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
