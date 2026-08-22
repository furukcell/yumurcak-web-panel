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
