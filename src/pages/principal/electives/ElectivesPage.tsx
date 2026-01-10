import { useState } from "react";
import DashboardLayout from "../../../components/DashboardLayout";
import {
  FileText,
  Home,
  Users,
  BookOpen,
  Bell,
  Megaphone,
  UserCog,
  Award,
} from "lucide-react";
import CreateElectives from "./CreateElectives";
import ViewElectives from "./ViewElectives";

export default function ElectivesPage() {
  const [activeTab, setActiveTab] = useState<"create" | "view">("create");

  const sidebarItems = [
    {
      label: "Dashboard",
      path: "/principal-dashboard",
      icon: <Home className="h-5 w-5" />,
    },
    {
      label: "Staff",
      path: "/principal/staff",
      icon: <Users className="h-5 w-5" />,
    },
    {
      label: "Students",
      path: "/principal/students",
      icon: <Users className="h-5 w-5" />,
    },
    {
      label: "Subjects",
      path: "/principal/subjects",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      label: "Electives",
      path: "/principal/electives",
      icon: <BookOpen className="h-5 w-5" />,
    },
    {
      label: "Feedback",
      path: "/principal/feedback",
      icon: <Award className="h-5 w-5" />,
    },
    {
      label: "Notices",
      path: "/principal/notices",
      icon: <Megaphone className="h-5 w-5" />,
    },
    {
      label: "Leave Requests",
      path: "/principal/leave-requests",
      icon: <UserCog className="h-5 w-5" />,
    },
    {
      label: "Notifications",
      path: "/principal/notifications",
      icon: <Bell className="h-5 w-5" />,
    },
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">
            Electives Management
          </h1>
          <p className="text-slate-600">Create and manage elective subjects</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200">
            <nav className="flex" aria-label="Tabs">
              <button
                onClick={() => setActiveTab("create")}
                className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === "create"
                    ? "bg-blue-50 text-blue-600 border-b-2 border-blue-600"
                    : "text-slate-600 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                Create Electives
              </button>
              <button
                onClick={() => setActiveTab("view")}
                className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === "view"
                    ? "bg-blue-50 text-blue-600 border-b-2 border-blue-600"
                    : "text-slate-600 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                View Electives
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === "create" ? <CreateElectives /> : <ViewElectives />}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
