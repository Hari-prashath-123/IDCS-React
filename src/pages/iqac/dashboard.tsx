import { useEffect, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

export default function IQACDashboard() {
  const { profile } = useAuth();
  const [onLeave, setOnLeave] = useState<boolean>(false);

  useEffect(() => {
    const fetchLeave = async () => {
      try {
        if (!profile) return;
        const { data } = await supabase.from("staff").select("on_leave").eq("id", profile.id).maybeSingle();
        setOnLeave(!!data?.on_leave);
      } catch (err) {
        console.error("Failed to load leave status for IQAC dashboard", err);
      }
    };
    fetchLeave();
  }, [profile]);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Welcome, {profile?.name}!</h1>
            <p className="text-sm text-slate-600 mt-1">IQAC Dashboard — View Only</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm md:min-w-[240px]">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-slate-700">Leave Status:</span>
                <div className="text-sm font-semibold mt-1">{onLeave ? "On Leave" : "Active"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Link to="/iqac/od" className="bg-white rounded-lg border p-4 shadow-sm hover:shadow-md">
            <h3 className="font-semibold">OD Applications</h3>
            <p className="text-sm text-slate-500 mt-1">Pending approvals and recent requests</p>
          </Link>
          <Link to="/iqac/leave" className="bg-white rounded-lg border p-4 shadow-sm hover:shadow-md">
            <h3 className="font-semibold">Leave Applications</h3>
            <p className="text-sm text-slate-500 mt-1">Pending approvals and recent requests</p>
          </Link>
          <Link to="/iqac/bonafide" className="bg-white rounded-lg border p-4 shadow-sm hover:shadow-md">
            <h3 className="font-semibold">Bonafide Applications</h3>
            <p className="text-sm text-slate-500 mt-1">Pending approvals and recent requests</p>
          </Link>
          <Link to="/iqac/gatepass" className="bg-white rounded-lg border p-4 shadow-sm hover:shadow-md">
            <h3 className="font-semibold">Gatepass Applications</h3>
            <p className="text-sm text-slate-500 mt-1">Pending approvals and recent requests</p>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border p-4 shadow-sm">
            <h3 className="font-semibold mb-2">Department Summary</h3>
            <p className="text-sm text-slate-500">Placeholder: aggregate stats and quick metrics.</p>
          </div>

          <div className="bg-white rounded-lg border p-4 shadow-sm">
            <h3 className="font-semibold mb-2">Recent Notifications</h3>
            <p className="text-sm text-slate-500">Placeholder: recent activity and approvals.</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
