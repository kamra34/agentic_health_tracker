import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { userAPI, insightsAPI, targetAPI } from '../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, ReferenceArea, ReferenceLine, PieChart, Pie, Cell, Legend } from 'recharts';
import { format, differenceInCalendarDays, addDays } from 'date-fns';

function Insights() {
  const [metric, setMetric] = useState('weight'); // 'weight' | 'bmi'
  // Forecast controls
  const [trainWindow, setTrainWindow] = useState(60); // days
  const [horizonDays, setHorizonDays] = useState(60); // days
  const [method, setMethod] = useState('holt'); // 'holt' | 'ses' | 'ols' | 'poly2'
  // Diagnostics controls (independent window; default 3 months)
  const [diagWindow, setDiagWindow] = useState(90);

  // Diagnostics-scoped data (depends on diagWindow)
  const { data: summaryDiag } = useQuery({
    queryKey: ['insights','summary','diag', diagWindow],
    queryFn: async () => (await insightsAPI.getSummary({ window_days: (diagWindow > 0 ? diagWindow : undefined) })).data,
  });
  const { data: distributionsDiag } = useQuery({
    queryKey: ['insights','distributions','diag', diagWindow],
    queryFn: async () => (await insightsAPI.getDistributions(20, { window_days: (diagWindow > 0 ? diagWindow : undefined) })).data,
  });

  // Base data: history for past 6 months (from dashboard)
  const { data: dashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await userAPI.getDashboard()).data,
  });

  // Summary
  const { data: summary } = useQuery({
    queryKey: ['insights','summary', trainWindow],
    queryFn: async () => (await insightsAPI.getSummary({ window_days: (trainWindow>0?trainWindow:undefined) })).data,
  });

  // Forecast
  const { data: forecast } = useQuery({
    queryKey: ['insights','forecast', metric, trainWindow, horizonDays, method],
    queryFn: async () => (await insightsAPI.getForecast({ metric, horizon: horizonDays, method, train_window_days: (trainWindow>0?trainWindow:undefined) })).data,
  });

  // Insights data from backend
  const { data: seasonality } = useQuery({
    queryKey: ['insights','seasonality'],
    queryFn: async () => (await insightsAPI.getSeasonality()).data,
  });
  const { data: distributions } = useQuery({
    queryKey: ['insights','distributions'],
    queryFn: async () => (await insightsAPI.getDistributions(20)).data,
  });
  const { data: composition } = useQuery({
    queryKey: ['insights','composition'],
    queryFn: async () => (await insightsAPI.getComposition()).data,
  });
  const { data: goalAnalytics } = useQuery({
    queryKey: ['insights','goal-analytics'],
    queryFn: async () => (await insightsAPI.getGoalAnalytics()).data,
  });
  // All targets history (for visuals)
  const { data: allTargets } = useQuery({
    queryKey: ['targets','all'],
    queryFn: async () => (await targetAPI.list()).data,
  });
  const { data: calendar } = useQuery({
    queryKey: ['insights','calendar'],
    queryFn: async () => (await insightsAPI.getCalendar(365)).data,
  });

  const history = dashboard?.weight_trend || [];
  const user = dashboard?.user;

  // Build chart data: historical + forecast points merged by date
  const chartData = useMemo(() => {
    if (!history) return [];
    let h = (history || []).map(pt => {
      const d = new Date(pt.date);
      const base = { date: d, dateLabel: format(d, 'yyyy-MM-dd') };
      if (metric === 'weight') return { ...base, actual: parseFloat(pt.weight) };
      if (metric === 'bmi') {
        if (!user?.height) return null;
        const hM = parseFloat(user.height) / 100;
        const bmi = parseFloat(pt.weight) / (hM * hM);
        return { ...base, actual: parseFloat(bmi.toFixed(2)) };
      }
      return null;
    }).filter(Boolean);

    const f = (forecast?.points || []).map((p) => {
      // API returns date objects; ensure Date
      const d = new Date(p.date);
      return {
        date: d,
        dateLabel: format(d, 'yyyy-MM-dd'),
        forecast: p.forecast,
        lower: p.lower,
        upper: p.upper,
      };
    });

    // Compute rolling means for actual series
    const values = h.map(p => p.actual);
    const ma7 = movingAverage(values, 7);
    const ma30 = movingAverage(values, 30);
    for (let i = 0; i < h.length; i++) {
      h[i].ma7 = ma7[i] != null ? parseFloat(ma7[i].toFixed(2)) : null;
      h[i].ma30 = ma30[i] != null ? parseFloat(ma30[i].toFixed(2)) : null;
    }

    // Merge: keep all historical plus forecast points
    const merged = [...h, ...f];
    return merged;
  }, [history, forecast, metric, user]);

  // Training window overlay boundaries (based on full history)
  // Seasonality data (weekday/month) from backend
  const weekdayData = useMemo(() => {
    const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const arr = seasonality?.weekday_avg || [];
    return labels.map((name, i) => ({ name, value: arr[i] ?? 0 }));
  }, [seasonality]);
  const monthData = useMemo(() => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const arr = seasonality?.month_avg || [];
    return months.map((name, i) => ({ name, value: arr[i] ?? 0 }));
  }, [seasonality]);
  const histData = useMemo(() => {
    const bins = distributions?.daily_change_hist || [];
    return bins.map(b => ({ bin: `${b.bin_start.toFixed(2)}`, count: b.count }));
  }, [distributions]);
  const recentStd = distributions?.recent_std ?? 0;
  const outlierCount30d = distributions?.outliers_last_30d ?? 0;
  const currentUnits = metric === "weight" ? "kg" : "";
  // KPI range subtitles
  const rangeStr = (s, e) => (s && e ? `${format(new Date(s), 'yyyy-MM-dd')} - ${format(new Date(e), 'yyyy-MM-dd')}` : undefined);
  const trendRange = rangeStr(summary?.trend_window_start, summary?.trend_window_end);
  const volRange = rangeStr(summary?.volatility_window_start, summary?.volatility_window_end);
  const adhRange = rangeStr(summary?.adherence_window_start, summary?.adherence_window_end);

  // Training window overlay boundaries (based on full history)
  const trainOverlay = useMemo(() => {
    if (!history || history.length === 0 || trainWindow == null || trainWindow <= 0) return null;
    const last = new Date(history[history.length - 1].date);
    const cutoff = new Date(last);
    cutoff.setDate(cutoff.getDate() - (trainWindow - 1));
    return { x1: format(cutoff, 'yyyy-MM-dd'), x2: format(last, 'yyyy-MM-dd') };
  }, [history, trainWindow]);


  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Insights & Analytics</h1>
      </div>

      {/* Top Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <TrendSlopeCard summary={summary} />
        <BMITrendSlopeCard summary={summary} dashboard={dashboard} />
        <VolatilityCard summary={summary} />
        <AdherenceCard summary={summary} dashboard={dashboard} />
      </div>

      {/* Goals Overview (moved up): Goal analytics + Path to Active Goal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <GoalAnalyticsSection goalAnalytics={goalAnalytics} dashboard={dashboard} />
        </div>
        <div>
          <WhatIfSection dashboard={dashboard} />
        </div>
      </div>

      {/* Targets History & Stats */}
      <TargetsHistorySection targets={allTargets} />

      {/* Main layout: left (trends) and right (diagnostics) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Trend & Forecast */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Trend & Forecast</h2>
              {/* Controls: metric, train window, horizon, model */}
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Metric</span>
                  <select value={metric} onChange={(e)=>setMetric(e.target.value)} className="border rounded-md px-2 py-1 text-sm">
                    <option value="weight">Weight (kg)</option>
                    <option value="bmi">BMI</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Train</span>
                  <select value={trainWindow} onChange={(e)=>setTrainWindow(parseInt(e.target.value))} className="border rounded-md px-2 py-1 text-sm">
                    <option value={14}>2 weeks</option>
                    <option value={30}>1 month</option>
                    <option value={60}>2 months</option>
                    <option value={90}>3 months</option>
                    <option value={180}>6 months</option>
                    <option value={0}>All</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Horizon</span>
                  <select value={horizonDays} onChange={(e)=>setHorizonDays(parseInt(e.target.value))} className="border rounded-md px-2 py-1 text-sm">
                    <option value={30}>1 month</option>
                    <option value={60}>2 months</option>
                    <option value={90}>3 months</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Model</span>
                  <select value={method} onChange={(e)=>setMethod(e.target.value)} className="border rounded-md px-2 py-1 text-sm">
                    <option value="holt">Holt (trend)</option>
                    <option value="ses">SES</option>
                    <option value="ols">Linear</option>
                    <option value="poly2">Quadratic</option>
                  </select>
                  <span title="Holt: level + trend smoothing; SES: level only (no trend); Linear: straight line regression; Quadratic: polynomial curve (captures gentle curvature). Choose based on pattern stability." className="ml-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold rounded-full border border-gray-300 text-gray-600 bg-white cursor-help">i</span>
                </div>
              </div>
            </div>
            <div style={{ width: '100%', height: 360 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 12 }} domain={['auto','auto']} />
                  <Tooltip formatter={(v) => `${v} ${currentUnits}`} labelFormatter={(l) => l} />
                  {/* Forecast and bounds */}
                  <Line type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} dot={false} name="Actual" />
                  <Line type="monotone" dataKey="ma7" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="7d MA" />
                  <Line type="monotone" dataKey="ma30" stroke="#ef4444" strokeWidth={1.5} dot={false} name="30d MA" />
                  <Line type="monotone" dataKey="forecast" stroke="#2563eb" strokeDasharray="5 4" strokeWidth={2} dot={false} name="Forecast" />
                  <Line type="monotone" dataKey="upper" stroke="#93c5fd" strokeWidth={1} dot={false} name="Upper" />
                  <Line type="monotone" dataKey="lower" stroke="#93c5fd" strokeWidth={1} dot={false} name="Lower" />
                  {trainOverlay && (
                    <ReferenceArea x1={trainOverlay.x1} x2={trainOverlay.x2} strokeOpacity={0} fill="#bfdbfe" fillOpacity={0.2} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Rolling Means (7d & 30d) - Placeholder */}
          {/* Seasonality Hints */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Seasonality Hints</h2>
            <p className="text-sm text-gray-600 mb-3">Average daily change by weekday and month</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={weekdayData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v) => `${v.toFixed ? v.toFixed(3) : v} kg/day`} />
                    <Bar dataKey="value" fill="#60a5fa" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={monthData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v) => `${v.toFixed ? v.toFixed(3) : v} kg/day`} />
                    <Bar dataKey="value" fill="#34d399" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Composition Trends */}
          <CompositionSection composition={composition} />

          {/* Calendar Heatmap - Placeholder */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Calendar Heatmap</h2>
            <p className="text-sm text-gray-600 mb-3">Density of weigh-ins by date</p>
            <PlaceholderHeatmap calendar={calendar} />
          </div>

          {/* Distributions */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Distribution of Daily Changes</h2>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={histData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bin" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#a78bfa" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="space-y-6">

          {/* Diagnostics */}
          <div className="stat-card bg-gradient-to-br from-amber-50 to-orange-100 border-amber-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">Diagnostics</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">Window</span>
                <select value={diagWindow} onChange={(e)=>setDiagWindow(parseInt(e.target.value))} className="border rounded-md px-2 py-0.5 text-xs">
                  <option value={14}>2w</option>
                  <option value={30}>1m</option>
                  <option value={90}>3m</option>
                  <option value={180}>6m</option>
                  <option value={0}>All</option>
                </select>
                <span title="Plateau checks last 5 days for near-flat changes; Regress-to-mean checks if large spikes are followed by opposite moves toward the average." className="ml-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold rounded-full border border-gray-300 text-gray-600 bg-white cursor-help">i</span>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm text-gray-800">
              <div>
                <div className="text-xs text-gray-600">Plateau</div>
                <div className="font-semibold">{summaryDiag?.plateau_flag != null ? (summaryDiag.plateau_flag ? 'Possible' : 'No') : '--'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600">Outliers (window)</div>
                <div className="font-semibold">{(distributionsDiag?.window_outliers ?? distributionsDiag?.outliers_last_30d ?? 0)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-600">Regress-to-Mean</div>
                {summaryDiag?.rtm ? (
                  <div>
                    <div className="font-semibold">{Math.round(((summaryDiag.rtm.rate || 0) * 100))}% of extremes revert ({summaryDiag.rtm.reversions}/{summaryDiag.rtm.extremes})</div>
                    <div className="text-xs text-gray-600">Window: {summaryDiag.rtm.window_start || '--'} - {summaryDiag.rtm.window_end || '--'}</div>
                    {summaryDiag.rtm.example_dates && summaryDiag.rtm.example_dates.length > 0 ? (
                      <div className="mt-1 text-xs text-gray-700">Examples: {summaryDiag.rtm.example_dates.join(', ')}</div>
                    ) : (
                      <div className="mt-1 text-xs text-gray-500">No examples in range</div>
                    )}
                  </div>
                ) : (
                  <div className="font-semibold">Not enough data</div>
                )}
              </div>
            </div>
          </div>

          {/* (Goals moved above) */}
        </div>
      </div>
    </div>
  );
}

// Lightweight placeholder components
function PlaceholderChart({ label = 'Chart placeholder', height = 180 }) {
  return (
    <div className="w-full border border-dashed border-gray-300 rounded-md bg-gray-50/50 flex items-center justify-center" style={{ height }}>
      <span className="text-sm text-gray-500">{label}</span>
    </div>
  );
}

function PlaceholderHeatmap({ calendar }) {
  // Render last 12 months by month blocks using calendar.days
  const days = calendar?.days || [];
  if (!days.length) {
    return <div className="w-full border border-dashed border-gray-300 rounded-md bg-gray-50/50 p-4 text-sm text-gray-500">No data yet</div>;
  }
  // Group by month
  const groups = {};
  for (const cell of days) {
    const d = new Date(cell.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    (groups[key] ||= []).push({ d, count: cell.count });
  }
  const keys = Object.keys(groups).sort();
  const palette = (c) => c === 0 ? 'bg-gray-200' : c === 1 ? 'bg-emerald-200' : c === 2 ? 'bg-emerald-300' : 'bg-emerald-500';
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {keys.map((k) => {
        const arr = groups[k].sort((a,b)=>a.d-b.d);
        const label = `${arr[0].d.toLocaleString('default', { month: 'short' })} ${arr[0].d.getFullYear()}`;
        return (
          <div key={k} className="border rounded-md p-2 bg-white">
            <div className="text-xs text-gray-600 mb-1">{label}</div>
            <div className="grid grid-cols-7 gap-1">
              {arr.map((x, idx) => (
                <div key={idx} className={`h-3 w-3 rounded-sm ${palette(x.count)}`} title={`${format(x.d,'yyyy-MM-dd')}: ${x.count} entries`} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ----- Helpers -----
function movingAverage(values, window) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    sum += v;
    if (i >= window) sum -= values[i - window];
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

function stddev(arr) {
  if (!arr || arr.length < 2) return 0;
  const m = arr.reduce((a,b)=>a+b,0) / arr.length;
  const v = arr.reduce((a,b)=>a + (b-m)*(b-m), 0) / arr.length;
  return Math.sqrt(v);
}

function histogram(arr, bins = 20) {
  if (!arr || arr.length === 0) return [];
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  if (min === max) return [{ bin: min.toFixed(2), count: arr.length }];
  const width = (max - min) / bins;
  const counts = Array.from({ length: bins }, () => 0);
  for (const v of arr) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  return counts.map((c, i) => ({ bin: (min + i * width).toFixed(2), count: c }));
}

function countOutliers(arr) {
  if (!arr || arr.length < 3) return 0;
  const m = arr.reduce((a,b)=>a+b,0) / arr.length;
  const s = stddev(arr);
  if (s === 0) return 0;
  return arr.filter(v => Math.abs(v - m) > 3 * s).length;
}

function linReg(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  const meanX = xs.reduce((a,b)=>a+b,0) / n;
  const meanY = ys.reduce((a,b)=>a+b,0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]-meanX)*(ys[i]-meanY);
    den += (xs[i]-meanX)*(xs[i]-meanX);
  }
  const slope = den ? num/den : 0;
  const intercept = meanY - slope*meanX;
  return { slope, intercept };
}

function computeRecentSlope(history, user, metric = 'weight') {
  if (!history || history.length < 2) return 0;
  const cutoff = addDays(new Date(), -56);
  const points = history
    .map(p => ({ d: new Date(p.date), w: parseFloat(p.weight) }))
    .filter(p => p.d >= cutoff)
    .sort((a,b)=>a.d-b.d);
  if (points.length < 2) return 0;
  const xs = points.map(p => (p.d - points[0].d) / (1000*3600*24)); // days
  let ys = points.map(p => p.w);
  if (metric === 'bmi' && user?.height) {
    const hM = parseFloat(user.height) / 100;
    ys = points.map(p => p.w / (hM*hM));
  }
  const { slope } = linReg(xs, ys);
  return slope * 7; // per week
}

// ----- Sections -----
function CompositionSection({ composition }) {
  const series = (composition?.points || []).map(p => ({
    dateLabel: format(new Date(p.date), 'yyyy-MM-dd'),
    fat: p.fat_mass_est,
    lean: p.lean_mass_est,
  })).filter(p => p.fat != null && p.lean != null);

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Body Composition Trends</h2>
      <p className="text-sm text-gray-600 mb-3">Estimated fat vs lean mass</p>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <AreaChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="dateLabel" />
            <YAxis />
            <Tooltip />
            <Area type="monotone" dataKey="fat" stackId="1" stroke="#fb7185" fill="#fecaca" />
            <Area type="monotone" dataKey="lean" stackId="1" stroke="#34d399" fill="#bbf7d0" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GoalAnalyticsSection({ goalAnalytics, dashboard }) {
  const rows = goalAnalytics?.rows || [];
  const activeCount = rows.length;
  const nearestEta = rows
    .map(r => r.eta_conservative || r.eta_optimistic)
    .filter(Boolean)
    .sort((a,b)=> new Date(a) - new Date(b))[0];

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">Goals Overview</p>
          <p className="text-xl font-semibold text-gray-900">Active Goals: {activeCount}</p>
        </div>
        {nearestEta && (
          <div className="text-right">
            <div className="text-xs text-gray-600">Nearest ETA</div>
            <div className="text-sm font-medium text-gray-900">{format(new Date(nearestEta), 'yyyy-MM-dd')}</div>
          </div>
        )}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-gray-600">
              <th className="text-left pr-4">Goal</th>
              <th className="text-right pr-4">Required</th>
              <th className="text-right pr-4">Recent (last 8 wks OLS)</th>
              <th className="text-right pr-4">Fit</th>
              <th className="text-right">ETA</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="py-2 text-gray-700" colSpan={5}>No active goals or insufficient data.</td>
              </tr>
            )}
            {rows.map(r => {
              const req = r.required_slope_kg_per_week;
              const rec = r.recent_slope_kg_per_week;
              const sameSign = (req === 0) || ((req > 0) === (rec > 0));
              const ratio = req === 0 ? 1 : Math.min(2, Math.abs(rec) / (Math.abs(req) + 1e-6));
              const pct = Math.round(Math.min(100, ratio * 100));
              const fitLabel = sameSign ? (ratio >= 1 ? 'On Track' : 'Behind') : 'Opposite';
              const fitColor = sameSign ? (ratio >= 1 ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-rose-500';
              const maxBar = Math.max(Math.abs(req), Math.abs(rec), 0.1);
              const reqW = `${Math.round((Math.abs(req)/maxBar)*100)}%`;
              const recW = `${Math.round((Math.abs(rec)/maxBar)*100)}%`;
              return (
                <tr key={r.id} className="border-t align-top">
                  <td className="py-2 text-gray-800">
                    <div className="font-medium">{r.goal_label}</div>
                    <div className="mt-1 inline-flex gap-2">
                      {r.eta_conservative && <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">Cons: {r.eta_conservative}</span>}
                      {r.eta_optimistic && <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">Opt: {r.eta_optimistic}</span>}
                    </div>
                  </td>
                  <td className="py-2 text-right whitespace-nowrap text-gray-900">
                    <div className="font-medium">{req.toFixed(2)} kg/wk</div>
                    <div className="mt-1 w-28 h-2 bg-gray-200 rounded ml-auto">
                      <div className="h-2 rounded bg-blue-400" style={{ width: reqW }} />
                    </div>
                  </td>
                  <td className="py-2 text-right whitespace-nowrap text-gray-900">
                    <div className="font-medium">{rec.toFixed(2)} kg/wk</div>
                    <div className="mt-1 w-28 h-2 bg-gray-200 rounded ml-auto">
                      <div className="h-2 rounded bg-emerald-500" style={{ width: recW }} />
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`inline-block px-2 py-0.5 text-xs text-white rounded ${fitColor}`}>{fitLabel}</span>
                      <div className="w-24 h-2 bg-gray-200 rounded">
                        <div className="h-2 rounded bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-700">{r.probability_score}%</span>
                    </div>
                  </td>
                  <td className="py-2 text-right text-gray-800">
                    {r.eta_conservative || r.eta_optimistic ? `${r.eta_conservative ?? '--'} - ${r.eta_optimistic ?? '--'}` : '--'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WhatIfSection({ dashboard }) {
  const targets = dashboard?.active_targets || [];
  const currentWeight = dashboard?.stats?.current_weight != null ? parseFloat(dashboard.stats.current_weight) : null;
  const nearest = targets
    .slice()
    .sort((a,b) => new Date(a.date_of_target) - new Date(b.date_of_target))[0];
  const requiredWeekly = useMemo(() => {
    if (!nearest || currentWeight == null) return null;
    const targetWeight = parseFloat(nearest.target_weight);
    const created = new Date(nearest.created_date);
    const startW = nearest.starting_weight != null ? parseFloat(nearest.starting_weight) : currentWeight;
    const totalDays = Math.max(1, (new Date(nearest.date_of_target) - created) / (1000*3600*24));
    return (targetWeight - startW) / (totalDays / 7);
  }, [nearest, currentWeight]);
  const [weekly, setWeekly] = useState(requiredWeekly ?? -0.5); // kg/week

  let finishText = '--';
  if (nearest && currentWeight != null) {
    const targetWeight = parseFloat(nearest.target_weight);
    const delta = targetWeight - currentWeight; // kg to change
    if (weekly === 0) {
      finishText = 'No change at 0 kg/wk';
    } else if ((delta > 0 && weekly < 0) || (delta < 0 && weekly > 0)) {
      finishText = 'Unreachable with selected pace';
    } else {
      const weeks = Math.abs(delta / weekly);
      const days = Math.round(weeks * 7);
      const finish = addDays(new Date(), days);
      finishText = `${format(finish,'yyyy-MM-dd')} (~${Math.round(weeks)} wks)`;
    }
  }

  // Projection points for a simple linear path
  const projData = useMemo(() => {
    if (!nearest || currentWeight == null) return [];
    const targetWeight = parseFloat(nearest.target_weight);
    const signOk = (targetWeight >= currentWeight && weekly >= 0) || (targetWeight < currentWeight && weekly <= 0);
    const maxDays = 180;
    const out = [];
    let w = currentWeight;
    const daily = weekly / 7.0;
    const today = new Date();
    out.push({ dateLabel: format(today,'yyyy-MM-dd'), weight: w });
    for (let d = 1; d <= maxDays; d++) {
      w += daily;
      const dt = addDays(today, d);
      out.push({ dateLabel: format(dt,'yyyy-MM-dd'), weight: parseFloat(w.toFixed(2)) });
      if (signOk) {
        if ((daily >= 0 && w >= targetWeight) || (daily < 0 && w <= targetWeight)) break;
      }
    }
    return out;
  }, [nearest, currentWeight, weekly]);

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Path to Active Goal</p>
        {nearest && (
          <span className="text-xs text-gray-600">Target: {parseFloat(nearest.target_weight).toFixed(1)} kg by {nearest.date_of_target}</span>
        )}
      </div>
      {nearest ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-sm text-gray-800">
            <div>
              <div className="text-xs text-gray-600">Current</div>
              <div className="font-semibold">{currentWeight?.toFixed(1)} kg</div>
            </div>
            <div>
              <div className="text-xs text-gray-600">Required Pace</div>
              <div className="font-semibold">{requiredWeekly != null ? `${requiredWeekly.toFixed(2)} kg/wk` : '--'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-600">Estimated Finish</div>
              <div className="font-semibold">{finishText}</div>
            </div>
          </div>

          <div>
            <input type="range" min={-1.5} max={1.5} step={0.1} value={weekly} onChange={(e)=>setWeekly(parseFloat(e.target.value))} className="w-full" />
            <div className="mt-1 text-sm text-gray-700">Selected weekly change: {weekly.toFixed(1)} kg/week</div>
          </div>

          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={projData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateLabel" hide minTickGap={24} />
                <YAxis tick={{ fontSize: 12 }} domain={['auto','auto']} />
                <Tooltip formatter={(v) => `${v} kg`} labelFormatter={(l) => l} />
                <Line type="monotone" dataKey="weight" stroke="#2563eb" strokeWidth={2} dot={false} name="Projected" />
                {nearest && (
                  <ReferenceLine y={parseFloat(nearest.target_weight)} stroke="#10b981" strokeDasharray="4 4" label={{ value: 'Target', position: 'left', fill: '#065f46', fontSize: 12 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-700">Add an active goal to simulate path.</p>
      )}
    </div>
  );
}

export default Insights;

// ----- UI bits -----
function KpiCard({ label, value, info, subtitle }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-700">{label}</p>
        <span title={info} className="ml-2 inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold rounded-full border border-gray-300 text-gray-600 bg-white cursor-help">i</span>
      </div>
      <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}


function TrendSlopeCard({ summary }) {
  const has = summary && summary.trend_window_start && summary.trend_window_end;
  const start = has ? format(new Date(summary.trend_window_start), 'yyyy-MM-dd') : '--';
  const end = has ? format(new Date(summary.trend_window_end), 'yyyy-MM-dd') : '--';
  const startW = summary?.trend_start_weight != null ? `${summary.trend_start_weight} kg` : '--';
  const endW = summary?.trend_end_weight != null ? `${summary.trend_end_weight} kg` : '--';
  const d = summary?.trend_slope_kg_per_day != null ? summary.trend_slope_kg_per_day.toFixed(3) : '--';
  const w = summary?.trend_slope_kg_per_week != null ? summary.trend_slope_kg_per_week.toFixed(2) : '--';
  const m = summary?.trend_slope_kg_per_month != null ? summary.trend_slope_kg_per_month.toFixed(2) : '--';
  return (
    <div className="stat-card bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-700">Trend Slope (Weight)</p>
        <span title="Computed over a recent window (<= 3 months, >= 2 weeks when available)." className="ml-2 inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold rounded-full border border-gray-300 text-gray-600 bg-white cursor-help">i</span>
      </div>
      <div className="mt-1 text-gray-900">
        <div className="text-sm">{d} kg/day</div>
        <div className="text-lg font-semibold">{w} kg/week</div>
        <div className="text-sm">{m} kg/month</div>
      </div>
      <div className="mt-2 text-xs text-gray-600">
        <div>Range: {start} - {end}</div>
        <div>Starting data point: {start} ({startW})</div>
        <div>Last data point: {end} ({endW})</div>
      </div>
    </div>
  );
}

function BMITrendSlopeCard({ summary, dashboard }) {
  const has = summary && summary.trend_window_start && summary.trend_window_end;
  const start = has ? format(new Date(summary.trend_window_start), 'yyyy-MM-dd') : '--';
  const end = has ? format(new Date(summary.trend_window_end), 'yyyy-MM-dd') : '--';
  const user = dashboard?.user;
  const trend = dashboard?.weight_trend || [];
  const hM = user?.height ? parseFloat(user.height) / 100 : null;

  const findWeightOn = (dStr) => {
    if (!dStr) return null;
    const match = trend.find(t => format(new Date(t.date), 'yyyy-MM-dd') === format(new Date(dStr), 'yyyy-MM-dd'));
    return match ? (match.weight != null ? parseFloat(match.weight) : null) : null;
  };

  let startBMI = '--', endBMI = '--';
  if (hM && hM > 0) {
    const sw = findWeightOn(summary?.trend_window_start);
    const ew = findWeightOn(summary?.trend_window_end);
    if (sw != null) startBMI = (sw / (hM * hM)).toFixed(2);
    if (ew != null) endBMI = (ew / (hM * hM)).toFixed(2);
  }

  const w = summary?.trend_bmi_slope_per_week != null ? summary.trend_bmi_slope_per_week.toFixed(2) : '--';
  const d = summary?.trend_bmi_slope_per_week != null ? (summary.trend_bmi_slope_per_week / 7).toFixed(3) : '--';
  const m = summary?.trend_bmi_slope_per_week != null ? (summary.trend_bmi_slope_per_week * (30/7)).toFixed(2) : '--';

  return (
    <div className="stat-card bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-700">Trend Slope (BMI)</p>
        <span title="Computed over the same recent window as weight trend." className="ml-2 inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold rounded-full border border-gray-300 text-gray-600 bg-white cursor-help">i</span>
      </div>
      <div className="mt-1 text-gray-900">
        <div className="text-sm">{d} BMI/day</div>
        <div className="text-lg font-semibold">{w} BMI/week</div>
        <div className="text-sm">{m} BMI/month</div>
      </div>
      <div className="mt-2 text-xs text-gray-600">
        <div>Range: {start} - {end}</div>
        <div>Starting data point: {start} ({startBMI})</div>
        <div>Last data point: {end} ({endBMI})</div>
      </div>
    </div>
  );
}

function VolatilityCard({ summary }) {
  const has = summary && summary.volatility_window_start && summary.volatility_window_end;
  const start = has ? format(new Date(summary.volatility_window_start), 'yyyy-MM-dd') : '--';
  const end = has ? format(new Date(summary.volatility_window_end), 'yyyy-MM-dd') : '--';
  const sigmaD = summary?.volatility_kg != null ? summary.volatility_kg : null;
  const day = sigmaD != null ? sigmaD.toFixed(3) : '--';
  const week = sigmaD != null ? (sigmaD * Math.sqrt(7)).toFixed(2) : '--';
  const month = sigmaD != null ? (sigmaD * Math.sqrt(30)).toFixed(2) : '--';
  const n = summary?.volatility_count ?? undefined;
  return (
    <div className="stat-card bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-700">Volatility (Weight)</p>
        <span title="Std dev of daily weight change computed over the trend window; scaled to week/month by sqrt(time)." className="ml-2 inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold rounded-full border border-gray-300 text-gray-600 bg-white cursor-help">i</span>
      </div>
      <div className="mt-1 text-gray-900">
        <div className="text-sm">{day} kg/day</div>
        <div className="text-lg font-semibold">{week} kg/week</div>
        <div className="text-sm">{month} kg/month</div>
      </div>
      <div className="mt-2 text-xs text-gray-600">
        <div>Range: {start} - {end}</div>
        {n != null && <div>Daily deltas used: {n}</div>}
      </div>
    </div>
  );
}

function AdherenceCard({ summary, dashboard }) {
  const has = summary && summary.adherence_window_start && summary.adherence_window_end;
  const start = has ? format(new Date(summary.adherence_window_start), 'yyyy-MM-dd') : '--';
  const end = has ? format(new Date(summary.adherence_window_end), 'yyyy-MM-dd') : '--';
  const epw = summary ? summary.adherence.entries_per_week.toFixed(2) : '--';
  const avgGap = summary?.adherence?.avg_days_between != null ? `${summary.adherence.avg_days_between} days` : '--';
  const streak = summary?.adherence?.current_streak != null ? `${summary.adherence.current_streak} days` : '--';
  const longestGap = summary?.adherence?.longest_gap_days != null ? `${summary.adherence.longest_gap_days} days` : '--';
  const total = dashboard?.stats?.total_entries != null ? dashboard.stats.total_entries : undefined;
  let weeksCovered = '--';
  if (has) {
    const days = Math.max(1, Math.round((new Date(summary.adherence_window_end) - new Date(summary.adherence_window_start)) / (1000*3600*24)) + 1);
    weeksCovered = (days / 7).toFixed(1);
  }
  return (
    <div className="stat-card bg-gradient-to-br from-sky-50 to-sky-100 border-sky-200">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-700">Adherence</p>
        <span title="Entries per week based on unique logging days over the shown range." className="ml-2 inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold rounded-full border border-gray-300 text-gray-600 bg-white cursor-help">i</span>
      </div>
      <div className="mt-1 text-gray-900">
        <div className="text-lg font-semibold">{epw} entries/week</div>
        <div className="text-sm">Avg gap: {avgGap}</div>
        <div className="text-sm">Current streak: {streak}</div>
        <div className="text-sm">Longest gap: {longestGap}</div>
      </div>
      <div className="mt-2 text-xs text-gray-600">
        <div>Range: {start} - {end} {weeksCovered !== '--' && `(~${weeksCovered} weeks)`}</div>
        {total != null && <div>Total entries: {total}</div>}
      </div>
    </div>
  );
}





function TargetsHistorySection({ targets }) {
  const t = targets || [];
  if (!t.length) return null;

  const statusCounts = t.reduce((acc, x) => {
    const s = (x.status || 'unknown').toLowerCase();
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const total = t.length;
  const completed = statusCounts['completed'] || 0;
  const cancelled = (statusCounts['cancelled'] || statusCounts['failed']) || 0;
  const active = statusCounts['active'] || 0;
  const successRate = total ? Math.round((completed / total) * 100) : 0;

  const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#60a5fa'];
  const pieData = [
    { name: 'Active', value: active },
    { name: 'Completed', value: completed },
    { name: 'Cancelled', value: cancelled },
  ].filter(d => d.value > 0);

  // Required pace per target (kg/week) based on created_date -> date_of_target
  const paceRows = t.map(x => {
    const startW = x.starting_weight != null ? parseFloat(x.starting_weight) : (x.current_weight != null ? parseFloat(x.current_weight) : null);
    const targetW = x.target_weight != null ? parseFloat(x.target_weight) : null;
    const created = x.created_date ? new Date(x.created_date) : null;
    const due = x.date_of_target ? new Date(x.date_of_target) : null;
    let req = null;
    if (startW != null && targetW != null && created && due) {
      const totalDays = Math.max(1, (due - created) / (1000*3600*24));
      req = (targetW - startW) / (totalDays / 7);
    }
    let ach = null;
    if (req != null && x.final_weight != null) {
      ach = (parseFloat(x.final_weight) - startW) / ((Math.max(1, (due - created) / (1000*3600*24))) / 7);
    }
    return { id: x.id, label: `${targetW?.toFixed?.(1) ?? '--'} kg by ${x.date_of_target}`, status: x.status, req, ach };
  }).filter(r => r.req != null);

  const avgReq = paceRows.length ? (paceRows.reduce((a,b)=>a+(b.req||0),0)/paceRows.length) : 0;
  const avgAch = paceRows.filter(r=>r.ach!=null).length ? (paceRows.filter(r=>r.ach!=null).reduce((a,b)=>a+(b.ach||0),0)/paceRows.filter(r=>r.ach!=null).length) : null;

  // Pace histogram bins
  const bins = (() => {
    const values = paceRows.map(r=>r.req);
    if (!values.length) return [];
    const mn = Math.min(...values), mx = Math.max(...values);
    const nb = Math.min(10, Math.max(5, values.length));
    const width = (mx - mn) || 1;
    const step = width / nb;
    const counts = Array.from({length: nb},()=>0);
    for (const v of values) {
      let idx = Math.floor((v - mn) / (step||1));
      if (idx >= nb) idx = nb-1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    }
    return counts.map((c,i)=>({ bin: (mn + i*step).toFixed(2), count: c }));
  })();

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Targets History & Stats</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Total Targets" value={total} />
            <KpiCard label="Success Rate" value={`${successRate}%`} />
          </div>
          <div className="w-full" style={{height:220}}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                  {pieData.map((entry, index) => (
                    <Cell key={`slice-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend verticalAlign="bottom" height={36} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Avg Required Pace" value={`${avgReq.toFixed(2)} kg/wk`} />
            <KpiCard label="Avg Achieved Pace" value={avgAch != null ? `${avgAch.toFixed(2)} kg/wk` : '--'} />
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-2">Required Pace Distribution</p>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={bins}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bin" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#60a5fa" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
