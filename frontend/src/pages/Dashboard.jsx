import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { userAPI } from '../services/api';
import { TrendingUp, TrendingDown, Target, Scale, Calendar, Award } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

function Dashboard() {
  const [greeting, setGreeting] = useState('');

  // Fetch dashboard data
  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const response = await userAPI.getDashboard();
      return response.data;
    },
  });

  // Set greeting based on time
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error loading dashboard: {error.message}</p>
      </div>
    );
  }

  const { user, stats, recent_weights, active_targets, weight_trend } = dashboardData;

  // Calculate BMI category color
  const getBMIColor = (bmi) => {
    if (!bmi) return 'text-gray-600';
    if (bmi < 18.5) return 'text-blue-600';
    if (bmi < 25) return 'text-green-600';
    if (bmi < 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Calculate trend
  const weightChange = stats.total_change || 0;
  const isPositive = weightChange >= 0;

  // Format chart data
  const chartData = weight_trend.map(item => ({
    date: format(new Date(item.date), 'MMM dd'),
    weight: parseFloat(item.weight),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-800">
          {greeting}, {user.name}! 👋
        </h1>
        <p className="text-gray-600 mt-1">Here's your health journey overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Current Weight */}
        <div className="stat-card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Current Weight</p>
              <p className="text-3xl font-bold text-blue-700 mt-2">
                {stats.current_weight ? `${stats.current_weight} kg` : '--'}
              </p>
              {stats.total_change && (
                <div className="flex items-center mt-2 text-sm">
                  {isPositive ? (
                    <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
                  )}
                  <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
                    {isPositive ? '+' : ''}{stats.total_change} kg
                  </span>
                  <span className="text-gray-500 ml-1">total</span>
                </div>
              )}
            </div>
            <Scale className="w-10 h-10 text-blue-400" />
          </div>
        </div>

        {/* BMI */}
        <div className="stat-card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">BMI</p>
              <p className={`text-3xl font-bold mt-2 ${getBMIColor(stats.current_bmi)}`}>
                {stats.current_bmi || '--'}
              </p>
              {stats.bmi_category && (
                <p className="text-sm text-gray-600 mt-2">{stats.bmi_category}</p>
              )}
            </div>
            <Target className="w-10 h-10 text-green-400" />
          </div>
        </div>

        {/* Total Entries */}
        <div className="stat-card bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-purple-600 font-medium">Total Entries</p>
              <p className="text-3xl font-bold text-purple-700 mt-2">
                {stats.total_entries}
              </p>
              {stats.first_entry_date && stats.last_entry_date && (
                <p className="text-sm text-gray-600 mt-2">
                  {format(new Date(stats.first_entry_date), 'MMM yyyy')} - 
                  {format(new Date(stats.last_entry_date), 'MMM yyyy')}
                </p>
              )}
            </div>
            <Calendar className="w-10 h-10 text-purple-400" />
          </div>
        </div>

        {/* Active Goals */}
        <div className="stat-card bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-orange-600 font-medium">Active Goals</p>
              <p className="text-3xl font-bold text-orange-700 mt-2">
                {user.active_targets}
              </p>
              {user.active_targets > 0 && (
                <p className="text-sm text-gray-600 mt-2">Keep pushing!</p>
              )}
            </div>
            <Award className="w-10 h-10 text-orange-400" />
          </div>
        </div>
      </div>

      {/* Weight Trend Chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Weight Trend (Last 30 Days)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                domain={['dataMin - 2', 'dataMax + 2']}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="weight" 
                stroke="#0ea5e9" 
                strokeWidth={3}
                dot={{ fill: '#0ea5e9', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Weights */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">Recent Entries</h2>
            <button 
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              onClick={() => window.location.href = '/weights'}
            >
              View all →
            </button>
          </div>
          
          {recent_weights.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Scale className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>No weight entries yet</p>
              <button 
                className="btn btn-primary mt-4"
                onClick={() => window.location.href = '/weights'}
              >
                Add your first entry
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {recent_weights.slice(0, 5).map((weight) => (
                <div 
                  key={weight.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-800">{weight.weight} kg</p>
                    <p className="text-sm text-gray-500">
                      {format(new Date(weight.date_of_measurement), 'MMMM dd, yyyy')}
                    </p>
                  </div>
                  {weight.notes && (
                    <p className="text-xs text-gray-400 italic max-w-xs truncate">
                      {weight.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Targets */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">Active Goals</h2>
            <button 
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              onClick={() => window.location.href = '/targets'}
            >
              View all →
            </button>
          </div>

          {active_targets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Target className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>No active goals yet</p>
              <button 
                className="btn btn-primary mt-4"
                onClick={() => window.location.href = '/targets'}
              >
                Set your first goal
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {active_targets.map((target) => {
                const currentWeight = stats.current_weight || 0;
                const targetWeight = parseFloat(target.target_weight);
                const startWeight = parseFloat(target.starting_weight) || currentWeight;
                const totalChange = targetWeight - startWeight;
                const currentChange = currentWeight - startWeight;
                const progress = totalChange !== 0 
                  ? Math.min(Math.abs((currentChange / totalChange) * 100), 100)
                  : 0;
                
                const daysUntil = Math.ceil(
                  (new Date(target.date_of_target) - new Date()) / (1000 * 60 * 60 * 24)
                );

                return (
                  <div key={target.id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-800">
                          Target: {target.target_weight} kg
                        </p>
                        <p className="text-sm text-gray-500">
                          {format(new Date(target.date_of_target), 'MMMM dd, yyyy')}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-primary-600">
                        {daysUntil > 0 ? `${daysUntil} days left` : 'Due today!'}
                      </span>
                    </div>
                    
                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-600">Progress</span>
                        <span className="font-medium text-gray-800">{Math.round(progress)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-primary-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                    </div>

                    {target.reason && (
                      <p className="mt-2 text-sm text-gray-500 italic">
                        "{target.reason}"
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Motivational message */}
      {stats.average_weekly_change && (
        <div className="card bg-gradient-to-r from-primary-50 to-blue-50 border-primary-200">
          <div className="flex items-start gap-3">
            <div className="bg-primary-100 rounded-full p-2">
              <TrendingUp className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Your Progress</h3>
              <p className="text-gray-600">
                You're averaging <strong>{Math.abs(stats.average_weekly_change)} kg per week</strong>.
                {stats.average_weekly_change < 0 && " Keep up the great work! 💪"}
                {stats.average_weekly_change > 0 && " Stay focused on your goals! 🎯"}
                {stats.average_weekly_change === 0 && " Consistency is key! 🔥"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;