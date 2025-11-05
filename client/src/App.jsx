// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './utils/ProtectedRoute';
import Layout from './components/common/Layout.jsx';
// ...import pages
import StudentDashboard from './pages/dashboards/StudentDashboard.jsx';
import StaffDashboard from './pages/dashboards/StaffDashboard.jsx';
import HodDashboard from './pages/dashboards/HodDashboard.jsx';
import AhodDashboard from './pages/dashboards/AhodDashboard.jsx';
import PrincipalDashboard from './pages/dashboards/PrincipalDashboard.jsx';
import PetStaffDashboard from './pages/dashboards/PetStaffDashboard.jsx';
import UserProfile from './pages/profile/UserProfile.jsx';
import StaffApprovalPage from './pages/approvals/StaffApprovalPage.jsx';
import Login from './pages/auth/Login.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/auth/login" replace />} />
        <Route path="/auth/login" element={<Login />} />
    <Route path="/student/dashboard" element={<Layout><ProtectedRoute allowedRoles={['student']}><StudentDashboard /></ProtectedRoute></Layout>} />
    <Route path="/staff/dashboard" element={<Layout><ProtectedRoute allowedRoles={['staff']}><StaffDashboard /></ProtectedRoute></Layout>} />
    <Route path="/hod/dashboard" element={<Layout><ProtectedRoute allowedRoles={['hod']}><HodDashboard /></ProtectedRoute></Layout>} />
    <Route path="/ahod/dashboard" element={<Layout><ProtectedRoute allowedRoles={['ahod']}><AhodDashboard /></ProtectedRoute></Layout>} />
    <Route path="/principal/dashboard" element={<Layout><ProtectedRoute allowedRoles={['principal']}><PrincipalDashboard /></ProtectedRoute></Layout>} />
    <Route path="/petstaff/dashboard" element={<Layout><ProtectedRoute allowedRoles={['pet_staff']}><PetStaffDashboard /></ProtectedRoute></Layout>} />
    <Route path="/hod/approvals" element={<Layout><ProtectedRoute allowedRoles={['hod']}><StaffApprovalPage /></ProtectedRoute></Layout>} />
    <Route path="/ahod/approvals" element={<Layout><ProtectedRoute allowedRoles={['ahod','hod']}><StaffApprovalPage /></ProtectedRoute></Layout>} />
    <Route path="/profile" element={<Layout><ProtectedRoute allowedRoles={['student','staff','hod','ahod','principal','pet_staff']}><UserProfile /></ProtectedRoute></Layout>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
