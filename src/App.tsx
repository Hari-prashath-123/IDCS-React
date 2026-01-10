import FormsHome from './pages/principal/forms';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useEffect } from 'react';
import { setupAutoInvalidation } from './lib/queryCache';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import StudentDashboard from './pages/student/StudentDashboard';
import ApplicationPage from './pages/student/ApplicationPage';
import StaffDashboard from './pages/staff/StaffDashboard';
import StaffApplicationPage from './pages/staff/StaffApplicationPage';
import MyStudents from './pages/staff/MyStudents';
import MyMentees from './pages/staff/MyMentees';
import StaffStudentProfile from './pages/staff/student/[id]';
import StaffAttendance from './pages/staff/Attendance';
import AHODDashboard from './pages/ahod/AHODDashboard';
import AHODApplicationPage from './pages/ahod/AHODApplicationPage';
import AHODSubjects from './pages/ahod/AHODSubjects';
import AHODStaffPage from './pages/ahod/Staff';
import AHODStudentsPage from './pages/ahod/Students';
import AHODStudentProfile from './pages/ahod/StudentProfile';
import HODDashboard from './pages/hod/HODDashboard';
import HODApplicationPage from './pages/hod/HODApplicationPage';
import HODSubjects from './pages/hod/HODSubjects';
import HODCurriculum from './pages/hod/curriculum';
import IQACIndex from './pages/iqac/index';
import IQACDashboard from './pages/iqac/dashboard';
import IQACSubjects from './pages/iqac/subjects';
import IQACCurriculum from './pages/iqac/curriculum';
import IQACDepartments from './pages/iqac/departments';
import IQACODPage from './pages/iqac/od';
import IQACLeavePage from './pages/iqac/leave';
import IQACBonafidePage from './pages/iqac/bonafide';
import IQACGatepassPage from './pages/iqac/gatepass';
import ManageMentees from './pages/hod/ManageMentees';
import HODFeedbackPage from './pages/hod/HODFeedbackPage';
import HODStaffPage from './pages/hod/Staff';
import StaffProfilePage from './pages/hod/StaffProfile';
import HODStudentsPage from './pages/hod/Students';
import HODStudentProfile from './pages/hod/student/[id]';
import JustView from './pages/hod/JustView';
import HODStaffLeavePage from './pages/hod/HODStaffLeavePage';
import StaffStudentProfileDetail from './pages/staff/StaffStudentProfile';
import AdminDashboard from './pages/admin/AdminDashboard';
import StaffManageMentees from './pages/staff/ManageMentees';
import StaffLeaveApplicationPage from './pages/staff/StaffLeaveApplicationPage';
import StaffLeaveApprovalPage from './pages/staff/StaffLeaveApprovalPage';
import MyLeavePage from './pages/staff/MyLeavePage';
import EventParticipationForm from './pages/staff/EventParticipationForm';
import EventParticipationStatus from './pages/staff/EventParticipationStatus';
import PrincipalStaffLeavePage from './pages/principal/PrincipalStaffLeavePage';
import PSDashboard from './pages/ps/PSDashboard';
import PrincipalDashboard from './pages/principal/PrincipalDashboard';
import PEDashboard from './pages/pe/PEDashboard';
import GroupOD from './pages/pe/GroupOD';
import HODEventParticipationForm from './pages/hod/EventParticipationForm';
import HODEventParticipationApproval from './pages/hod/EventParticipationApproval';
import AHODEventParticipationForm from './pages/ahod/EventParticipationForm';
import IQACEventParticipationApproval from './pages/iqac/EventParticipationApproval';
import PrincipalEventParticipationApproval from './pages/principal/EventParticipationApproval';
import PrincipalSubjectsPage from './pages/principal/SubjectsPage';
import PrincipalStaffDetails from './pages/principal/StaffDetails';
import PrincipalStudentDetails from './pages/principal/StudentDetails';
import AttendancePage from './pages/principal/AttendancePage';
import PrincipalStaffProfile from './pages/principal/staff/[id]';
import PrincipalCreateStaff from './pages/principal/staff/create';
import PrincipalStudentProfile from './pages/principal/student/[id]';
import PrincipalFeedbackPage from './pages/principal/PrincipalFeedbackPage';
import PrincipalNoticesPage from './pages/principal/NoticesPage';
import PrincipalElectivesPage from "./pages/principal/electives/ElectivesPage";
import PSBonafide from './pages/ps/PSBonafide';
import NoticeDashboard from './pages/notice/NoticeDashboard';
import ManageNotices from './pages/notice/ManageNotices';
import Create from './pages/admin/Create';
import ViewsPage from './pages/admin/ViewsPage';
import SubjectsPage from './pages/admin/SubjectsPage';
import DepartmentsList from './pages/admin/DepartmentsList';
import StaffMySubjects from './pages/staff/MySubjects';
import MyElectives from './pages/student/MyElectives';
import StudentMySubjects from './pages/student/MySubjects';
import Attendance from './pages/student/Attendance';
import StudentFeedbacks from './pages/student/StudentFeedbacks';
import StudentFeedbackForm from './pages/student/StudentFeedbackForm';
import ProfilePage from './pages/ProfilePage';
import Unauthorized from './pages/Unauthorized';
import AdminTimetablePage from './pages/admin/TimetablePage';
import StaffTimetable from './pages/staff/StaffTimetable';
import CertificateUpload from './pages/student/CertificateUpload';
import StaffCertificates from './pages/staff/Certificates';
import StaffMyCertificates from './pages/staff/Mycertificates';
import HODCertificates from './pages/hod/Certificates';
import AHODCertificates from './pages/ahod/Certificates';
import GatepassScan from './pages/GatepassScan';
import AllNotifications from './pages/AllNotifications';
import ViewStaffTimetable from './pages/shared/ViewStaffTimetable';
import ViewStaffMentees from './pages/shared/ViewStaffMentees';
import NoticesPage from './pages/shared/NoticesPage';
import DepartmentPage from './pages/staff/DepartmentPage';

function DashboardRedirect() {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  // Check if PE HOD/AHOD for special dashboard redirect
  if (
    (profile.role === 'hod' || profile.role === 'ahod') &&
    (String(profile.department || '').toLowerCase().includes('physical') || 
     String(profile.department || '').toLowerCase() === 'pe')
  ) {
    return <Navigate to="/pe-dashboard" replace />;
  }

  switch (profile.role) {
    case "student":
      return <Navigate to="/student-dashboard" replace />;
    case "staff":
      return <Navigate to="/staff-dashboard" replace />;
    case "ps":
      return <Navigate to="/ps-dashboard" replace />;
    case "principal":
      return <Navigate to="/principal-dashboard" replace />;
    case "ahod":
      return <Navigate to="/ahod-dashboard" replace />;
    case "admin":
      return <Navigate to="/admin-dashboard" replace />;
    case "hod":
      return <Navigate to="/hod-dashboard" replace />;
    case "notice":
      return <Navigate to="/notice-dashboard" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}

// Small wrapper: allow access to principal pages for either a principal,
// or for an HOD who belongs to the IQAC department.
function IQACOrPrincipal({ children }: { children: JSX.Element }) {
  const { profile } = useAuth();
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.role === 'principal') return children;
  if (profile.role === 'hod' && profile.department === 'IQAC') return children;
  return <Unauthorized />;
}

function IQACHODOnly({ children }: { children: JSX.Element }) {
  const { profile } = useAuth();
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.role === 'hod' && profile.department === 'IQAC') return children;
  return <Unauthorized />;
}

function App() {
  // Initialize auto-invalidation for query cache
  useEffect(() => {
    const cleanup = setupAutoInvalidation();
    return cleanup;
  }, []);

  // Handle cases where Supabase redirects to the site root with auth tokens
  // (some Supabase links use the Site URL root rather than a specific callback path).
  function AuthUrlHandler(): null {
    const navigate = useNavigate();

    useEffect(() => {
      const href = window.location.href;
      const hasTokenInHash = href.includes('access_token') || href.includes('type=') || window.location.hash.includes('access_token');
      const hasTypeInSearch = window.location.search.includes('type=');
      if (!hasTokenInHash && !hasTypeInSearch) return;

      (async () => {
        try {
          const { data, error } = await supabase.auth.getSessionFromUrl({ storeSession: true });
          if (error) console.error('getSessionFromUrl error', error);
        } catch (err) {
          console.error('AuthUrlHandler error', err);
        }

        const url = new URL(window.location.href);
        const qType = url.searchParams.get('type');
        const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
        const hType = hashParams.get('type');
        const type = qType || hType;

        if (type === 'recovery') {
          navigate('/reset-password');
        } else if (type === 'signup' || type === 'invite') {
          navigate('/profile');
        } else {
          navigate('/');
        }
      })();
    }, [navigate]);

    return null;
  }

  return (
    <Router>
      <AuthProvider>
        <AuthUrlHandler />
        <Routes>
          <Route path="/principal/forms" element={<FormsHome />} />

          <Route
            path="/staff/student-profile/:id"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffStudentProfile />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* Public gatepass scan confirmation page (no auth required) */}
          <Route path="/gatepass-scan" element={<GatepassScan />} />
          <Route path="/dashboard" element={<DashboardRedirect />} />

          <Route
            path="/student-dashboard"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/od"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <ApplicationPage type="od" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/electives"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <MyElectives />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/attendance"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <Attendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/subjects"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <StudentMySubjects />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/feedback"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <StudentFeedbacks />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/feedback/:id"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <StudentFeedbackForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/leave"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <ApplicationPage type="leave" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/gatepass"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <ApplicationPage type="gatepass" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/bonafide"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <ApplicationPage type="bonafide" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute
                allowedRoles={[
                  "student",
                  "staff",
                  "ahod",
                  "hod",
                  "admin",
                  "principal",
                ]}
              >
                <AllNotifications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notices"
            element={
              <ProtectedRoute
                allowedRoles={[
                  "student",
                  "staff",
                  "ahod",
                  "hod",
                  "admin",
                  "principal",
                  "ps",
                ]}
              >
                <NoticesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/certificates"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <CertificateUpload />
              </ProtectedRoute>
            }
          />

          <Route
            path="/staff-dashboard"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ps-dashboard"
            element={
              <ProtectedRoute allowedRoles={["ps"]}>
                <PSDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pe-dashboard"
            element={
              <ProtectedRoute allowedRoles={["hod","ahod"]}>
                <PEDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pe/group-od"
            element={
              <ProtectedRoute allowedRoles={["hod","ahod"]}>
                <GroupOD />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/event-participation-form"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODEventParticipationForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/event-participation-approval"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODEventParticipationApproval />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ahod/event-participation-form"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <AHODEventParticipationForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/iqac/event-participation-approval"
            element={
              <ProtectedRoute allowedRoles={["hod","principal"]}>
                <IQACEventParticipationApproval />
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/event-participation-approval"
            element={
              <ProtectedRoute allowedRoles={["principal"]}>
                <PrincipalEventParticipationApproval />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ps/bonafide"
            element={
              <ProtectedRoute allowedRoles={["ps"]}>
                <PSBonafide />
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal-dashboard"
            element={
              <ProtectedRoute allowedRoles={["principal"]}>
                <PrincipalDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/subjects"
            element={
              <ProtectedRoute allowedRoles={["principal", "hod"]}>
                <PrincipalSubjectsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/electives"
            element={
              <ProtectedRoute allowedRoles={["principal", "hod"]}>
                <PrincipalElectivesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notice-dashboard"
            element={
              <ProtectedRoute allowedRoles={["notice"]}>
                <NoticeDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notice/manage"
            element={
              <ProtectedRoute allowedRoles={["notice"]}>
                <ManageNotices />
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/staff-details"
            element={

              <ProtectedRoute allowedRoles={['principal','hod']}>
                <IQACOrPrincipal>
                  <PrincipalStaffDetails />
                </IQACOrPrincipal>
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/attendance"
            element={
              <ProtectedRoute allowedRoles={['principal', 'hod']}>
                <AttendancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/staff/:id"
            element={

              <ProtectedRoute allowedRoles={['principal','hod']}>
                <IQACOrPrincipal>
                  <PrincipalStaffProfile />
                </IQACOrPrincipal>
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/staff/create"
            element={
              <ProtectedRoute allowedRoles={['principal','hod']}>
                <IQACOrPrincipal>
                  <PrincipalCreateStaff />
                </IQACOrPrincipal>
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/student-details"
            element={

              <ProtectedRoute allowedRoles={['principal','hod']}>
                <IQACOrPrincipal>
                  <PrincipalStudentDetails />
                </IQACOrPrincipal>
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/student/:id"
            element={

              <ProtectedRoute allowedRoles={['principal','hod']}>
                <IQACOrPrincipal>
                  <PrincipalStudentProfile />
                </IQACOrPrincipal>
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/staff/:staffId/timetable"
            element={
              <ProtectedRoute allowedRoles={["principal"]}>
                <ViewStaffTimetable />
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/staff/:staffId/mentees"
            element={
              <ProtectedRoute allowedRoles={["principal"]}>
                <ViewStaffMentees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/feedback"
            element={
              <ProtectedRoute allowedRoles={["principal"]}>
                <PrincipalFeedbackPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/notices"
            element={
              <ProtectedRoute allowedRoles={["principal"]}>
                <PrincipalNoticesPage />
              </ProtectedRoute>
            }
          />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route
            path="/staff/od"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffApplicationPage type="od" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/leave"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffApplicationPage type="leave" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/gatepass"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffApplicationPage type="gatepass" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/bonafide"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffApplicationPage type="bonafide" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/attendance"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffAttendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/students"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <MyStudents />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/student/:id"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffStudentProfileDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/mentees"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <MyMentees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/department"
            element={
              <ProtectedRoute allowedRoles={["staff", "ahod", "hod"]}>
                <DepartmentPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/subjects"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffMySubjects />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/timetable"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffTimetable />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/certificates"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffCertificates />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/my-certificates"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffMyCertificates />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ahod/my-certificates"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <StaffMyCertificates />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/manage-mentees"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffManageMentees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/my-certificates"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <StaffMyCertificates />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/leave-application"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffLeaveApplicationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/leave-approval"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffLeaveApprovalPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/my-leave"
            element={
              <ProtectedRoute allowedRoles={["staff", "hod", "ahod"]}>
                <MyLeavePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/event-participation-form"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <EventParticipationForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/event-participation-status"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <EventParticipationStatus />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ahod-dashboard"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <AHODDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ahod/od"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <AHODApplicationPage type="od" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ahod/leave"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <AHODApplicationPage type="leave" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ahod/gatepass"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <AHODApplicationPage type="gatepass" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ahod/bonafide"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <AHODApplicationPage type="bonafide" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ahod/certificates"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <AHODCertificates />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ahod/mentees"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <MyMentees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ahod/subjects"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <AHODSubjects />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ahod/attendance"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <StaffAttendance />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ahod/staff"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <AHODStaffPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ahod/staff/:staffId/timetable"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <ViewStaffTimetable />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ahod/staff/:staffId/mentees"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <ViewStaffMentees />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ahod/students"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <AHODStudentsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ahod/student/:studentId"
            element={
              <ProtectedRoute allowedRoles={["ahod"]}>
                <AHODStudentProfile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/hod-dashboard"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODDashboard />
              </ProtectedRoute>
            }
          />
          {/* IQAC HOD specific dashboard and application routes */}
          <Route
            path="/iqac"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <IQACHODOnly>
                  <IQACIndex />
                </IQACHODOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/iqac/dashboard"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <IQACHODOnly>
                  <IQACDashboard />
                </IQACHODOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/iqac/od"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <IQACHODOnly>
                  <IQACODPage />
                </IQACHODOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/iqac/subjects"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <IQACHODOnly>
                  <IQACSubjects />
                </IQACHODOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/iqac/leave"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <IQACHODOnly>
                  <IQACLeavePage />
                </IQACHODOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/iqac/bonafide"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <IQACHODOnly>
                  <IQACBonafidePage />
                </IQACHODOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/iqac/gatepass"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <IQACHODOnly>
                  <IQACGatepassPage />
                </IQACHODOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/iqac/curriculum"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <IQACHODOnly>
                  <IQACCurriculum />
                </IQACHODOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/iqac/departments"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <IQACHODOnly>
                  <IQACDepartments />
                </IQACHODOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/Create"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Create />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/subjects"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <SubjectsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/timetable"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminTimetablePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/views"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <ViewsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/departments"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <DepartmentsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/od"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODApplicationPage type="od" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/attendance"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <StaffAttendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/leave"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODApplicationPage type="leave" />
              </ProtectedRoute>
            }
          />

          <Route
            path="/hod/students"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODStudentsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/hod/student/:id"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODStudentProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/gatepass"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODApplicationPage type="gatepass" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/bonafide"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODApplicationPage type="bonafide" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/certificates"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODCertificates />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/staff-leave-approval"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODStaffLeavePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/mentees"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <MyMentees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/feedback"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODFeedbackPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/subjects"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODSubjects />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/curriculum"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODCurriculum />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/manage-mentees"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <ManageMentees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/just-view"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <JustView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/principal/staff-leave"
            element={
              <ProtectedRoute allowedRoles={["principal"]}>
                <PrincipalStaffLeavePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/hod/staff"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <HODStaffPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/staff/:id/timetable"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <ViewStaffTimetable />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/staff/:id/mentees"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <ViewStaffMentees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/staff/:id/profile"
            element={
              <ProtectedRoute allowedRoles={["hod"]}>
                <StaffProfilePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute
                allowedRoles={[
                  "student",
                  "staff",
                  "ahod",
                  "hod",
                  "admin",
                  "ps",
                  "principal",
                ]}
              >
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
