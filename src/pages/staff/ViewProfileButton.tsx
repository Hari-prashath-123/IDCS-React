import { useNavigate } from 'react-router-dom';

interface Props {
  studentId: string;
  regNo: string;
}

export default function ViewProfileButton({ studentId, regNo }: Props) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/hod/student/${studentId}`)}
      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
      title={`View profile for ${regNo}`}
    >
      View
    </button>
  );
}