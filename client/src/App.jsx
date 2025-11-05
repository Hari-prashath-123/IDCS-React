// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './utils/ProtectedRoute';
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
        <Route path="/auth/login" element={<Login />} />
        <Route path="/student/dashboard" element={<ProtectedRoute allowedRoles={['student']}><StudentDashboard /></ProtectedRoute>} />
        <Route path="/staff/dashboard" element={<ProtectedRoute allowedRoles={['staff']}><StaffDashboard /></ProtectedRoute>} />
        <Route path="/hod/dashboard" element={<ProtectedRoute allowedRoles={['hod']}><HodDashboard /></ProtectedRoute>} />
        <Route path="/ahod/dashboard" element={<ProtectedRoute allowedRoles={['ahod']}><AhodDashboard /></ProtectedRoute>} />
        <Route path="/principal/dashboard" element={<ProtectedRoute allowedRoles={['principal']}><PrincipalDashboard /></ProtectedRoute>} />
        <Route path="/petstaff/dashboard" element={<ProtectedRoute allowedRoles={['pet_staff']}><PetStaffDashboard /></ProtectedRoute>} />
        <Route path="/hod/approvals" element={<ProtectedRoute allowedRoles={['hod']}><StaffApprovalPage /></ProtectedRoute>} />
        <Route path="/ahod/approvals" element={<ProtectedRoute allowedRoles={['ahod','hod']}><StaffApprovalPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute allowedRoles={['student','staff','hod','ahod','principal','pet_staff']}><UserProfile /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
