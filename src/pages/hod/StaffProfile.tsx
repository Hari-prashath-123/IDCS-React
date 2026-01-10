import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import ViewProfile from '../../components/ViewProfile';

export default function StaffProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  if (!id) {
    return (
      <DashboardLayout>
        <div className="max-w-5xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            Invalid staff ID
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ViewProfile 
        userId={id} 
        showDownloadButton={true}
        showBackButton={true}
        onBack={() => {
          try {
            if (window.history.length > 1) navigate(-1);
            else navigate('/hod/staff');
          } catch (e) {
            navigate('/hod/staff');
          }
        }}
      />
    </DashboardLayout>
  );
}
