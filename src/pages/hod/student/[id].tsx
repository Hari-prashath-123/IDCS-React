import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../../../components/DashboardLayout';
import ViewProfile from '../../../components/ViewProfile';

export default function HODStudentById() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qpYear = searchParams.get('year');
  const qpSection = searchParams.get('section');

  if (!id) {
    return (
      <DashboardLayout>
        <div className="text-red-600">No student ID provided</div>
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
          const y = qpYear ? `?year=${encodeURIComponent(qpYear)}&section=${encodeURIComponent(qpSection || '')}` : '';
          navigate(`/hod/students${y}`);
        }}
      />
    </DashboardLayout>
  );
}
