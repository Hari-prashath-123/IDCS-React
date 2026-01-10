import DashboardLayout from '../../components/DashboardLayout';

export default function DepartmentsList() {
  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-800">Departments</h1>
          <p className="text-slate-600 mt-1">List of departments with their HOD and AHOD.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
