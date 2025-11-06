import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, weightAPI } from '../services/api';
import { TrendingUp, TrendingDown, Target, Scale, Calendar, Award, ArrowDown, Clock, TrendingUp as ProgressIcon, CheckCircle, XCircle, Save } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush } from 'recharts';
import { format, subDays, subMonths } from 'date-fns';

function Dashboard() {
  const [greeting, setGreeting] = useState('');
  const [timeWindow, setTimeWindow] = useState('month'); // 'week', 'month', '6months', 'all'
  const [metric, setMetric] = useState('weight'); // 'weight' | 'bmi' | 'body_fat' | 'muscle'

  // Fetch dashboard data
  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const response = await userAPI.getDashboard();
      return response.data;
    },
  });

  // Hooks must be declared before any early returns
  const queryClient = useQueryClient();
  const [quickWeight, setQuickWeight] = useState('');
  const [quickNotes, setQuickNotes] = useState('');
  const addQuickMutation = useMutation({
    mutationFn: (data) => weightAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['dashboard']);
      queryClient.invalidateQueries(['weights']);
      setQuickWeight('');
      setQuickNotes('');
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
      case 'all':
        cutoffDate = new Date(0); // include everything
        break;
      default:
        cutoffDate = subMonths(now, 1);
    }

    const toPoint = (item) => {
      const base = {
        date: format(new Date(item.date), 'MMM dd'),
        fullDate: item.date,
      };
      if (metric === 'weight') {
        return { ...base, value: parseFloat(item.weight), unit: 'kg' };
      }
      if (metric === 'bmi') {
        if (!user?.height) return null;
        const h = parseFloat(user.height) / 100;
        const v = parseFloat(item.weight) / (h * h);
        return { ...base, value: parseFloat(v.toFixed(2)), unit: '' };
      }
      if (metric === 'body_fat') {
        const v = item.body_fat_percentage != null ? parseFloat(item.body_fat_percentage) : null;
        return v != null ? { ...base, value: v, unit: '%' } : null;
      }
      if (metric === 'muscle') {
        const v = item.muscle_mass != null ? parseFloat(item.muscle_mass) : null;
        return v != null ? { ...base, value: v, unit: 'kg' } : null;
      }
      return null;
    };

    // Build series points for the selected window (or all if empty)
    const filtered = weight_trend
      .filter(item => new Date(item.date) >= cutoffDate)
      .map(toPoint)
      .filter(Boolean);

    const all = weight_trend.map(toPoint).filter(Boolean);
    const points = (filtered.length > 0 ? filtered : all);
    // Attach previous values for icon direction
    for (let i = 0; i < points.length; i++) {
      points[i].prev = i > 0 ? points[i - 1].value : null;
    }
    return points;
  };

  const chartData = getFilteredChartData();
  const currentUnit = chartData.length > 0 ? (chartData[0].unit || '') : '';

  // Custom dot rendering: filled triangles (red up, green down)
  const TrendDot = ({ cx, cy, payload, index }) => {
    if (index === 0 || !payload || payload.prev == null || cx == null || cy == null) return null;
    const isUp = payload.value >= payload.prev;
    const fill = isUp ? '#ef4444' : '#10b981'; // red up, green down
    const size = 12; // overall size
    const half = size / 2;
    // Define triangle points relative to (0,0), then translate
    const points = isUp
      ? `0,${-half} ${-half},${half * 0.8} ${half},${half * 0.8}` // pointing up
      : `0,${half} ${-half},${-half * 0.8} ${half},${-half * 0.8}`; // pointing down
    return (
      <g transform={`translate(${cx}, ${cy})`} style={{ pointerEvents: 'none' }}>
        <polygon points={points} fill={fill} stroke="#ffffff" strokeWidth={1} />
      </g>
    );
  };

  const todayISO = new Date().toISOString().split('T')[0];
  const userHeightCm = user?.height ? parseFloat(user.height) : null;
  const quickBMI = (quickWeight && userHeightCm)
    ? (parseFloat(quickWeight) / Math.pow(userHeightCm / 100, 2)).toFixed(2)
    : null;

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
                  {/* <ArrowDown className="w-4 h-4 text-red-600 mr-1" />
                  <span className="text-red-600 font-medium">
                    {Math.abs(parseFloat(stats.total_change)).toFixed(1)} kg
                  </span>
                  <span className="text-gray-500 ml-1">total</span> */}
                </div>
              )}

              {/* Trend indicators */}
              <div className="mt-2 space-y-1">
                <TrendIndicator change={stats.weekly_change} label="week" />
                <TrendIndicator change={stats.monthly_change} label="month" />
                <TrendIndicator change={stats.six_month_change} label="6 month" />
              </div>
            </div>
            <Scale className="w-10 h-10 text-blue-400 flex-shrink-0" />
          </div>
        </div>

        {/* BMI */}
        <div className="stat-card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-start justify-between">
            <div className="flex-1 pr-4">
              <p className="text-sm text-green-600 font-medium">BMI</p>
              <p className={`text-3xl font-bold mt-2 ${getBMIColor(stats.current_bmi)}`}>
                {stats.current_bmi || '--'}
              </p>
              {stats.bmi_category && (
                <p className="text-sm text-gray-600 mt-1">{stats.bmi_category}</p>
              )}

              {/* BMI Range Visual (modern, equal segments with marker) */}
              {(() => {
                const bmiMax = 50;
                const bmiVal = stats.current_bmi != null ? parseFloat(stats.current_bmi) : null;
                const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
                const segments = [
                  { label: 'Under',  colorBar: 'bg-blue-300',   colorText: 'text-blue-700' },
                  { label: 'Normal', colorBar: 'bg-green-400',  colorText: 'text-green-700' },
                  { label: 'Over',   colorBar: 'bg-yellow-400', colorText: 'text-yellow-700' },
                  { label: 'Ob I',   colorBar: 'bg-orange-400', colorText: 'text-orange-700' },
                  { label: 'Ob II',  colorBar: 'bg-orange-500', colorText: 'text-orange-800' },
                  { label: 'Ob III', colorBar: 'bg-red-500',    colorText: 'text-red-700' },
                ];
                // Thresholds for categories: Under(<18.5), Normal(<25), Over(<30), Ob I(<35), Ob II(<40), Ob III(<=50)
                const thresholds = [0, 18.5, 25, 30, 35, 40, bmiMax];
                let percent = null;
                if (bmiVal != null) {
                  if (bmiVal >= thresholds[thresholds.length - 1]) {
                    percent = 100;
                  } else {
                    let idx = 0;
                    for (let i = 0; i < thresholds.length - 1; i++) {
                      if (bmiVal < thresholds[i + 1]) { idx = i; break; }
                    }
                    const start = thresholds[idx];
                    const end = thresholds[idx + 1];
                    const frac = clamp((bmiVal - start) / (end - start), 0, 1);
                    const segWidth = 100 / segments.length;
                    percent = (idx + frac) * segWidth;
                  }
                }
                return (
                  <div className="mt-3">
                    <div className="relative">
                      <div className="flex gap-0.5 h-4 rounded-full overflow-hidden shadow-sm bg-white border border-green-200">
                        {segments.map((s, i) => (
                          <div
                            key={i}
                            className={`${s.colorBar} flex-1 ${i === 0 ? 'rounded-l-full' : ''} ${i === segments.length - 1 ? 'rounded-r-full' : ''}`}
                          />
                        ))}
                      </div>
                      {percent != null && (
                        <div
                          className="absolute -top-1 left-0"
                          style={{ left: `calc(${percent}% - 1px)` }}
                        >
                          <div className="w-0.5 h-6 bg-emerald-800 rounded-full shadow" />
                        </div>
                      )}
                    </div>
                    <div className="mt-1 grid grid-cols-6 text-[11px]">
                      {segments.map((s, i) => (
                        <div key={i} className={`text-center ${s.colorText}`}>{s.label}</div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
            <Target className="w-10 h-10 text-green-400 flex-shrink-0" />
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
              {(stats.current_streak || stats.longest_streak) && (
                <p className="text-sm text-gray-600 mt-1">
                  Streak: <span className="font-medium">{stats.current_streak || 0} days</span>
                  {typeof stats.longest_streak === 'number' && (
                    <span className="ml-2 text-gray-500">• Longest: {stats.longest_streak} days</span>
                  )}
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

      {/* Trend Chart with Metric + Time Window Selector */}
      {chartData.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-800">Trend</h2>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {[
                  { key: 'weight', label: 'Weight' },
                  { key: 'bmi', label: 'BMI' },
                  { key: 'body_fat', label: 'Fat %' },
                  { key: 'muscle', label: 'Muscle' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setMetric(opt.key)}
                    className={`px-3 py-1 text-sm rounded-md ${metric === opt.key ? 'bg-white shadow text-gray-800' : 'text-gray-600 hover:text-gray-800'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
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
              <button
                onClick={() => setTimeWindow('all')}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  timeWindow === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
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
                formatter={(value) => {
                  const suffix = metric === 'body_fat' ? '%' : (metric === 'bmi' ? '' : ' kg');
                  const label = metric === 'weight' ? 'Weight' : metric === 'bmi' ? 'BMI' : metric === 'body_fat' ? 'Body Fat' : 'Muscle Mass';
                  return [`${value}${suffix}`, label];
                }}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#0ea5e9" 
                strokeWidth={3}
                dot={<TrendDot />}
                activeDot={{ r: 0 }}
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
        {/* Recent Weights + Quick Check-in */}
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

          {/* Quick Check-in Form */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!quickWeight) return;
                addQuickMutation.mutate({
                  date_of_measurement: todayISO,
                  weight: parseFloat(quickWeight),
                  notes: quickNotes || null,
                });
              }}
              className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
            >
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="500"
                  className="input"
                  placeholder="e.g., 75.5"
                  value={quickWeight}
                  onChange={(e) => setQuickWeight(e.target.value)}
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="How do you feel?"
                  value={quickNotes}
                  onChange={(e) => setQuickNotes(e.target.value)}
                />
              </div>
              <div className="flex gap-2 md:col-span-1">
                <button
                  type="submit"
                  className="btn btn-primary w-full flex items-center justify-center gap-2"
                  disabled={addQuickMutation.isPending}
                >
                  <Save size={16} />
                  {addQuickMutation.isPending ? 'Saving...' : 'Check in'}
                </button>
              </div>
              {quickBMI && (
                <div className="md:col-span-5 text-xs text-gray-600">
                  BMI: <span className="font-semibold">{quickBMI}</span> (auto-calculated)
                </div>
              )}
              {addQuickMutation.isError && (
                <div className="md:col-span-5 text-xs text-red-600">
                  {addQuickMutation.error?.response?.data?.detail || 'Failed to add entry'}
                </div>
              )}
            </form>
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
              <p>No active goals right now</p>
              <button 
                className="btn btn-primary mt-4"
                onClick={() => window.location.href = '/targets'}
              >
                Create a new goal
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {active_targets.map((target) => {
                const progress = target.progress_percentage || 0;
                const isOnTrack = target.days_remaining > 0;
                const daysText = Math.abs(target.days_remaining);
                // Time progress (from created_date to date_of_target)
                const msPerDay = 24 * 60 * 60 * 1000;
                const createdAt = target.created_date ? new Date(target.created_date) : null;
                const targetDate = target.date_of_target ? new Date(target.date_of_target) : null;
                const now = new Date();
                let timeProgress = null;
                let passedDays = null;
                let totalDays = null;
                if (createdAt && targetDate && !isNaN(createdAt) && !isNaN(targetDate)) {
                  totalDays = Math.max(1, Math.ceil((targetDate - createdAt) / msPerDay));
                  passedDays = Math.max(0, Math.min(totalDays, Math.ceil((now - createdAt) / msPerDay)));
                  timeProgress = Math.max(0, Math.min(100, Math.round((passedDays / totalDays) * 100)));
                }
                
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
                      {/* Weight progress percent moved below with the bar for clarity */}
                    </div>

                    {/* Weight Progress */}
                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                      <div className="flex items-center gap-1">
                        <Scale className="w-3.5 h-3.5 text-primary-600" />
                        <span>Weight Progress</span>
                      </div>
                      <div className={`font-medium ${progress >= 100 ? 'text-green-700' : 'text-primary-700'}`}>{progress.toFixed(0)}%</div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full transition-all duration-500 ${
                          progress >= 100 ? 'bg-green-500' : 'bg-primary-600'
                        }`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-gray-600 flex items-center gap-1">
                      <Scale className="w-3.5 h-3.5 text-gray-500" />
                      <span>To Go:</span>
                      <span className="font-semibold text-gray-700">{Math.abs(parseFloat(target.weight_to_lose || 0)).toFixed(1)} kg</span>
                    </div>

                    {/* Time Progress */}
                    {timeProgress != null && (
                      <>
                        <div className="flex items-center justify-between text-xs text-gray-600 mt-3 mb-1">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Time Progress</span>
                          </div>
                          <div className="font-medium text-indigo-800">{timeProgress}%</div>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-500 ${timeProgress >= 100 ? 'bg-orange-500' : 'bg-indigo-500'}`}
                            style={{ width: `${Math.min(timeProgress, 100)}%` }}
                          />
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          <span className="inline-flex items-center gap-1">
                            <Clock className={`w-3.5 h-3.5 ${isOnTrack ? 'text-green-600' : 'text-orange-600'}`} />
                            <span>{isOnTrack ? 'Remaining' : 'Overdue'}:</span>
                            <span className={`font-semibold ${isOnTrack ? 'text-green-700' : 'text-orange-700'}`}>{daysText} days</span>
                          </span>
                          <span className="ml-2 text-gray-500">({passedDays}d passed · {totalDays - passedDays}d left)</span>
                        </div>
                      </>
                    )}

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

              {/* Current vs Target tiles (simplified) */}
              {(() => {
                const heightCm = user?.height ? parseFloat(user.height) : null;
                const h = heightCm ? heightCm / 100 : null;
                const sex = (user?.sex || '').toLowerCase();
                const dob = user?.date_of_birth ? new Date(user.date_of_birth) : null;
                const today = new Date();
                const age = dob ? Math.max(0, today.getFullYear() - dob.getFullYear() - ((today.getMonth()<dob.getMonth()) || (today.getMonth()===dob.getMonth() && today.getDate()<dob.getDate()) ? 1 : 0)) : null;
                const currentW = target.final_weight != null ? parseFloat(target.final_weight) : null;
                const targetW = target.target_weight != null ? parseFloat(target.target_weight) : null;
                if (!h || !currentW || !targetW) return null;

                const bmi = (w) => +(w / (h*h)).toFixed(2);
                const isMale = sex.startsWith('m');
                const bf = (w) => {
                  if (age == null) return null;
                  const b = bmi(w);
                  const flag = isMale ? 1 : 0;
                  const val = 1.2*b + 0.23*age - 10.8*flag - 5.4;
                  return +Math.min(60, Math.max(3, val)).toFixed(1);
                };
                const lbm = (w) => {
                  const val = isMale ? (0.407*w + 0.267*heightCm - 19.2) : (0.252*w + 0.473*heightCm - 48.3);
                  return +Math.max(0, Math.min(w, val)).toFixed(1);
                };

                const rows = [
                  { key: 'bmi', label: 'BMI', cur: bmi(currentW), to: bmi(targetW), unit: '', better: 'lower', healthy: [18.5, 25] },
                  { key: 'fat', label: 'Body Fat %', cur: bf(currentW), to: bf(targetW), unit: '%', better: 'lower', healthy: isMale ? [10,20] : [18,28] },
                  { key: 'muscle', label: 'Lean Mass', cur: lbm(currentW), to: lbm(targetW), unit: 'kg', better: 'higher' },
                ];

                const Chip = ({ title, value, unit, tone='default' }) => (
                  <div className={`px-3 py-2 rounded-lg border text-sm ${
                    tone==='good' ? 'bg-green-50 border-green-200 text-green-700' :
                    tone==='warn' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                    'bg-gray-50 border-gray-200 text-gray-700'
                  }`}>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500">{title}</div>
                    <div className="font-semibold">{value}{unit}</div>
                  </div>
                );

                const BetterHint = ({ better, cur, to }) => {
                  const good = better==='lower' ? (to < cur) : (to > cur);
                  return (
                    <div className="text-xs">
                      <span className="text-gray-500 mr-1">Δ</span>
                      <span className={`${good ? 'text-green-700' : 'text-orange-700'}`}>
                        {(to - cur > 0 ? '+' : '')}{(to - cur).toFixed( rows.find(r=>r.cur===cur)?.unit==='%' ? 1 : (rows.find(r=>r.cur===cur)?.key==='bmi' ? 2 : 1) )}
                      </span>
                      <span className="ml-1 text-gray-500">{good ? 'toward healthy' : 'away'}</span>
                    </div>
                  );
                };

                return (
                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <p className="text-sm font-medium text-gray-700 mb-2">Current vs Target</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {rows.map((r) => (
                        (r.cur!=null && r.to!=null) && (
                          <div key={r.key} className="p-3 rounded-lg bg-white border border-gray-200">
                            <div className="text-xs text-gray-500 mb-1">{r.label}</div>
                            <div className="grid grid-cols-2 gap-2 items-start">
                              <Chip title="Current" value={r.cur} unit={r.unit} />
                              <Chip title="Target" value={r.to} unit={r.unit} tone={(r.better==='lower' ? (r.to < r.cur) : (r.to > r.cur)) ? 'good':'warn'} />
                            </div>
                            <div className="mt-2">
                              <BetterHint better={r.better} cur={r.cur} to={r.to} />
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                );
              })()}
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
