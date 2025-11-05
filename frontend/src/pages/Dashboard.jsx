import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { userAPI } from '../services/api';
import { TrendingUp, TrendingDown, Target, Scale, Calendar, Award, ArrowDown, Clock, TrendingUp as ProgressIcon, CheckCircle, XCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush } from 'recharts';
import { format, subDays, subMonths } from 'date-fns';

function Dashboard() {
  const [greeting, setGreeting] = useState('');
  const [timeWindow, setTimeWindow] = useState('month'); // 'week', 'month', '6months'

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

  // Filter chart data based on selected time window
  const getFilteredChartData = () => {
    if (!weight_trend || weight_trend.length === 0) return [];

    const now = new Date();
    let cutoffDate;

    switch (timeWindow) {
      case 'week':
        cutoffDate = subDays(now, 7);
        break;
      case 'month':
        cutoffDate = subMonths(now, 1);
        break;
      case '6months':
        cutoffDate = subMonths(now, 6);
        break;
      default:
        cutoffDate = subMonths(now, 1);
    }

    const filtered = weight_trend
      .filter(item => new Date(item.date) >= cutoffDate)
      .map(item => ({
        date: format(new Date(item.date), 'MMM dd'),
        fullDate: item.date,
        weight: parseFloat(item.weight),
      }));

    return filtered.length > 0 ? filtered : weight_trend.map(item => ({
      date: format(new Date(item.date), 'MMM dd'),
      fullDate: item.date,
      weight: parseFloat(item.weight),
    }));
  };

  const chartData = getFilteredChartData();

  // Commitment: % of last 30 days with at least one entry
  const commitmentPercentage = (() => {
    if (!weight_trend || weight_trend.length === 0) return null;
    const now = new Date();
    const start = subDays(now, 30);
    const uniqueDays = new Set(
      weight_trend
        .filter(item => new Date(item.date) >= start)
        .map(item => new Date(item.date).toDateString())
    );
    const pct = Math.max(0, Math.min(100, Math.round((uniqueDays.size / 30) * 100)));
    return pct;
  })();

  // Render trend indicator
  const TrendIndicator = ({ change, label }) => {
    if (change === null || change === undefined) {
      return (
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <span>{label}</span>
          <span>N/A</span>
        </div>
      );
    }

    const isPositive = change >= 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;
    const colorClass = isPositive ? 'text-red-600' : 'text-green-600';

    return (
      <div className={`flex items-center gap-1 text-xs ${colorClass}`}>
        <Icon className="w-3 h-3" />
        <span className="font-medium">{Math.abs(parseFloat(change)).toFixed(1)} kg</span>
        <span className="text-gray-500">{label}</span>
      </div>
    );
  };

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
        {/* Enhanced Current Weight with Trends */}
        <div className="stat-card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-blue-600 font-medium">Current Weight</p>
              <p className="text-3xl font-bold text-blue-700 mt-2">
                {stats.current_weight ? `${stats.current_weight} kg` : '--'}
              </p>
              
              {/* Total change indicator */}
              {stats.total_change && (
                <div className="flex items-center mt-2 text-sm pb-2 border-b border-blue-200">
                  <ArrowDown className="w-4 h-4 text-red-600 mr-1" />
                  <span className="text-red-600 font-medium">
                    {Math.abs(parseFloat(stats.total_change)).toFixed(1)} kg
                  </span>
                  <span className="text-gray-500 ml-1">total</span>
                </div>
              )}

              {/* Trend indicators */}
              <div className="mt-2 space-y-1">
                <TrendIndicator change={stats.weekly_change} label="week" />
                <TrendIndicator change={stats.monthly_change} label="month" />
                <TrendIndicator change={stats.six_month_change} label="6mo" />
              </div>
            </div>
            <Scale className="w-10 h-10 text-blue-400 flex-shrink-0" />
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

        {/* Total Goals with breakdown */}
        <div className="stat-card bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-orange-600 font-medium">Total Goals</p>
              <p className="text-3xl font-bold text-orange-700 mt-2">
                {user.total_targets ?? 0}
              </p>
              {/* Breakdown */}
              <div className="mt-3 space-y-1 text-sm text-gray-700">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-4 h-4 text-blue-600" /> Active: <strong>{user.active_targets ?? 0}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-green-600" /> Succeeded: <strong>{user.completed_targets ?? 0}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <XCircle className="w-4 h-4 text-gray-600" /> Failed: <strong>{user.failed_targets ?? 0}</strong>
                  </span>
                </div>
                {commitmentPercentage !== null && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <ProgressIcon className="w-3 h-3 text-orange-600" />
                    Commitment: <span className="font-medium text-gray-800">{commitmentPercentage}%</span> last 30 days
                  </div>
                )}
              </div>
            </div>
            <Award className="w-10 h-10 text-orange-400" />
          </div>
        </div>
      </div>

      {/* Weight Trend Chart with Time Window Selector */}
      {chartData.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">Weight Trend</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setTimeWindow('week')}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  timeWindow === 'week'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setTimeWindow('month')}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  timeWindow === 'month'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setTimeWindow('6months')}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  timeWindow === '6months'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                6 Months
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                angle={-45}
                textAnchor="end"
                height={60}
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
                formatter={(value) => [`${value} kg`, 'Weight']}
              />
              <Line 
                type="monotone" 
                dataKey="weight" 
                stroke="#0ea5e9" 
                strokeWidth={3}
                dot={{ fill: '#0ea5e9', r: 4 }}
                activeDot={{ r: 6 }}
              />
              {chartData.length > 10 && (
                <Brush 
                  dataKey="date" 
                  height={30} 
                  stroke="#0ea5e9"
                  fill="#eff6ff"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-500 text-center mt-2">
            {chartData.length > 10 && "Use the slider below to zoom and pan through your data"}
          </p>
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
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Targets - ENHANCED */}
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
                const progress = target.progress_percentage || 0;
                const isOnTrack = target.days_remaining > 0;
                const daysText = Math.abs(target.days_remaining);
                
                return (
                  <div key={target.id} className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                    {/* Target Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Target className="w-5 h-5 text-primary-600" />
                          <p className="font-bold text-gray-800 text-lg">
                            {target.target_weight} kg
                          </p>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          Target: {format(new Date(target.date_of_target), 'MMM dd, yyyy')}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`text-2xl font-bold ${progress >= 100 ? 'text-green-600' : 'text-primary-600'}`}>
                          {progress.toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                      <div 
                        className={`h-3 rounded-full transition-all duration-500 ${
                          progress >= 100 ? 'bg-green-500' : 'bg-primary-600'
                        }`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>

                    {/* Progress Details */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {/* Weight to Lose */}
                      <div className="flex items-center gap-2">
                        <Scale className="w-4 h-4 text-gray-500" />
                        <div>
                          <p className="text-gray-500 text-xs">To Go</p>
                          <p className="font-semibold text-gray-700">
                            {Math.abs(parseFloat(target.weight_to_lose || 0)).toFixed(1)} kg
                          </p>
                        </div>
                      </div>

                      {/* Days Remaining */}
                      <div className="flex items-center gap-2">
                        <Clock className={`w-4 h-4 ${isOnTrack ? 'text-green-500' : 'text-orange-500'}`} />
                        <div>
                          <p className="text-gray-500 text-xs">
                            {isOnTrack ? 'Remaining' : 'Overdue'}
                          </p>
                          <p className={`font-semibold ${isOnTrack ? 'text-green-700' : 'text-orange-700'}`}>
                            {daysText} days
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Estimated Completion (if available) */}
                    {target.estimated_completion && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center gap-2 text-sm">
                          <ProgressIcon className="w-4 h-4 text-blue-500" />
                          <span className="text-gray-600">Est. completion:</span>
                          <span className="font-medium text-blue-700">
                            {format(new Date(target.estimated_completion), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Average Weekly Change - UPDATED */}
      {stats.average_weekly_change !== null && stats.average_weekly_change !== undefined ? (
        <div className="card bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
          <div className="text-center">
            <p className="text-sm text-indigo-600 font-medium mb-2">Average Weekly Progress (Last 5-6 Weeks)</p>
            <div className="flex items-center justify-center gap-2">
              {stats.average_weekly_change < 0 ? (
                <TrendingDown className="w-8 h-8 text-green-600" />
              ) : (
                <TrendingUp className="w-8 h-8 text-red-600" />
              )}
              <p className={`text-4xl font-bold ${stats.average_weekly_change < 0 ? 'text-green-700' : 'text-red-700'}`}>
                {stats.average_weekly_change < 0 ? '' : '+'}{stats.average_weekly_change} kg
              </p>
            </div>
            <div className="mt-3">
              <p className="text-sm text-gray-600">
                {stats.average_weekly_change < 0 && " Keep up the great work! 💪"}
                {stats.average_weekly_change > 0 && " Stay focused on your goals! 🎯"}
                {stats.average_weekly_change === 0 && " Consistency is key! 🔥"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
          <div className="text-center py-6">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p className="text-gray-600 font-medium">Not enough data for weekly average</p>
            <p className="text-sm text-gray-500 mt-2">
              We need at least 2 weeks of weight entries to calculate your average weekly progress
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
