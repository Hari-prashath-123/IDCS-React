import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';

export default function ProtectedRoute({ allowedRoles, children }) {
  const { user } = useContext(AuthContext);

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    switch (user.role) {
      case 'student':
        return <Navigate to="/student/dashboard" replace />;
      case 'staff':
        return <Navigate to="/staff/dashboard" replace />;
      case 'hod':
        return <Navigate to="/hod/dashboard" replace />;
      case 'ahod':
        return <Navigate to="/ahod/dashboard" replace />;
      case 'principal':
        return <Navigate to="/principal/dashboard" replace />;
      case 'pet_staff':
        return <Navigate to="/petstaff/dashboard" replace />;
      default:
        return <Navigate to="/not-authorized" replace />;
    }
  }

  return children;
}