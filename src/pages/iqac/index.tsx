import { Link } from "react-router-dom";
import DashboardLayout from "../../components/DashboardLayout";

export default function IQACIndex() {
  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">IQAC — Quick Links</h1>
        <p className="text-slate-600 mb-6">Access common application queues for IQAC HOD.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link to="/iqac/od" className="block p-4 bg-white rounded-lg shadow border hover:shadow-md">
            <h3 className="font-semibold">OD Applications</h3>
            <p className="text-sm text-slate-500">View and approve OD requests</p>
          </Link>

          <Link to="/iqac/leave" className="block p-4 bg-white rounded-lg shadow border hover:shadow-md">
            <h3 className="font-semibold">Leave Applications</h3>
            <p className="text-sm text-slate-500">View and approve leave requests</p>
          </Link>

          <Link to="/iqac/bonafide" className="block p-4 bg-white rounded-lg shadow border hover:shadow-md">
            <h3 className="font-semibold">Bonafide Applications</h3>
            <p className="text-sm text-slate-500">View and approve bonafide requests</p>
          </Link>

          <Link to="/iqac/gatepass" className="block p-4 bg-white rounded-lg shadow border hover:shadow-md">
            <h3 className="font-semibold">Gatepass Applications</h3>
            <p className="text-sm text-slate-500">View and approve gatepass requests</p>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
