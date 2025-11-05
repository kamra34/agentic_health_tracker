function Dashboard() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="stat-card">
          <p className="text-gray-600 text-sm">Current Weight</p>
          <p className="text-3xl font-bold text-primary-600 mt-2">-- kg</p>
        </div>
        <div className="stat-card">
          <p className="text-gray-600 text-sm">BMI</p>
          <p className="text-3xl font-bold text-primary-600 mt-2">--</p>
        </div>
        <div className="stat-card">
          <p className="text-gray-600 text-sm">Total Entries</p>
          <p className="text-3xl font-bold text-primary-600 mt-2">--</p>
        </div>
        <div className="stat-card">
          <p className="text-gray-600 text-sm">Active Targets</p>
          <p className="text-3xl font-bold text-primary-600 mt-2">--</p>
        </div>
      </div>
      <div className="mt-8 card">
        <p className="text-gray-600">Dashboard data will be implemented in Phase 1 completion...</p>
      </div>
    </div>
  );
}

export default Dashboard;
