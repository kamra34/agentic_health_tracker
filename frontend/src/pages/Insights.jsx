import { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { userAPI, insightsAPI, targetAPI } from '../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, ReferenceArea, ReferenceLine, PieChart, Pie, Cell, Legend, Brush } from 'recharts';
import { format, differenceInCalendarDays, addDays } from 'date-fns';

function Insights() {
  const [metric, setMetric] = useState('weight'); // 'weight' | 'bmi'
  // Forecast controls
  const [trainWindow, setTrainWindow] = useState(60); // days
  const [horizonDays, setHorizonDays] = useState(60); // days
  const [method, setMethod] = useState('holt'); // 'holt' | 'ses' | 'ols' | 'poly2'
  // Diagnostics controls (independent window; default 3 months)
  const [diagWindow, setDiagWindow] = useState(90);

  // Goals Overview height sync for TargetsHistorySection
  const goalsOverviewRef = useRef(null);
  const [goalsHeight, setGoalsHeight] = useState(null);
  // measurement effect added later after goalAnalytics is defined

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
  const [seasonWindow, setSeasonWindow] = useState(90);
  const { data: seasonality } = useQuery({
    queryKey: ['insights','seasonality', seasonWindow],
    queryFn: async () => (await insightsAPI.getSeasonality({ window_days: (seasonWindow>0?seasonWindow:undefined) })).data,
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
  // Measure Goals Overview height when data loads/resizes
  useEffect(() => {
    const measure = () => {
      if (goalsOverviewRef.current) {
        setGoalsHeight(goalsOverviewRef.current.offsetHeight);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [goalAnalytics]);
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
    const n = seasonality?.weekday_n || [];
    const loss = seasonality?.weekday_loss_pct || [];
    return labels.map((name, i) => ({ name, value: arr[i] ?? 0, n: n[i] ?? 0, loss: loss[i] ?? 0 }));
  }, [seasonality]);
  const monthData = useMemo(() => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const arr = seasonality?.month_avg || [];
    const n = seasonality?.month_n || [];
    const loss = seasonality?.month_loss_pct || [];
    return months.map((name, i) => ({ name, value: arr[i] ?? 0, n: n[i] ?? 0, loss: loss[i] ?? 0 }));
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

      {/* Goals Overview (left) and Path to Active Goal (right) */}
      {(() => {
        // Measure Goals Overview height to match the three-cards row below
        const goalsRef = goalsOverviewRef;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 items-start">
            <div className="lg:col-span-2">
              <div ref={goalsRef}>
                <GoalAnalyticsSection goalAnalytics={goalAnalytics} dashboard={dashboard} />
              </div>
              <div className="mt-6" style={{ minHeight: (goalsHeight != null ? `${goalsHeight}px` : undefined) }}>
                <TargetsHistorySection targets={allTargets} />
              </div>
            </div>
            <div>
              <WhatIfSection dashboard={dashboard} />
            </div>
          </div>
        );
      })()}

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
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Seasonality Hints</h2>
                <p className="text-sm text-gray-600">Average daily change by weekday and month</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">Window</span>
                <select value={seasonWindow} onChange={(e)=>setSeasonWindow(parseInt(e.target.value))} className="border rounded-md px-2 py-1 text-sm">
                  <option value={30}>1m</option>
                  <option value={90}>3m</option>
                  <option value={180}>6m</option>
                  <option value={0}>All</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={weekdayData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v, n, p) => {
                      const d = p && p.payload ? p.payload : {};
                      if (n === 'Loss %') return `${v}%`;
                      return `${(v?.toFixed ? v.toFixed(3) : v)} kg/day (N=${d.n ?? 0}, Loss ${d.loss ?? 0}%)`;
                    }} />
                    <Bar dataKey="value" name="Avg" fill="#60a5fa" opacity={0.9} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={monthData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v, n, p) => {
                      const d = p && p.payload ? p.payload : {};
                      if (n === 'Loss %') return `${v}%`;
                      return `${(v?.toFixed ? v.toFixed(3) : v)} kg/day (N=${d.n ?? 0}, Loss ${d.loss ?? 0}%)`;
                    }} />
                    <Bar dataKey="value" name="Avg" fill="#34d399" opacity={0.9} />
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
  const raw = (composition?.points || [])
    .map(p => ({
      d: new Date(p.date),
      dateLabel: format(new Date(p.date), 'yyyy-MM-dd'),
      fat: p.fat_mass_est != null ? parseFloat(p.fat_mass_est) : null,
      lean: p.lean_mass_est != null ? parseFloat(p.lean_mass_est) : null,
    }))
    .filter(p => p.fat != null && p.lean != null)
    .sort((a,b)=>a.d-b.d);

  const [compWindow, setCompWindow] = useState(180);
  const [smooth, setSmooth] = useState('off'); // 'off'|'ma7'|'ma30'
  const [modePct, setModePct] = useState(false); // false=kg true=%

  const filtered = useMemo(() => {
    if (!raw.length) return [];
    if (!compWindow || compWindow <= 0) return raw;
    const cutoff = addDays(new Date(), -compWindow);
    return raw.filter(p => p.d >= cutoff);
  }, [raw, compWindow]);

  const smoothed = useMemo(() => {
    if (!filtered.length) return [];
    if (smooth === 'off') return filtered.map(p=>({ ...p }));
    const k = smooth === 'ma7' ? 7 : 30;
    const fats = filtered.map(p=>p.fat);
    const leans = filtered.map(p=>p.lean);
    const sFat = movingAverage(fats, k);
    const sLean = movingAverage(leans, k);
    return filtered.map((p,i)=>({ ...p, fat: sFat[i] ?? p.fat, lean: sLean[i] ?? p.lean }));
  }, [filtered, smooth]);

  const series = useMemo(() => {
    return smoothed.map(p => {
      const total = p.fat + p.lean;
      return modePct
        ? { ...p, fatPct: total ? +(p.fat/total*100).toFixed(2) : 0, leanPct: total ? +(p.lean/total*100).toFixed(2) : 0 }
        : { ...p, total };
    });
  }, [smoothed, modePct]);

  // Summary metrics
  const summary = useMemo(() => {
    if (!series.length) return null;
    const first = series[0];
    const last = series[series.length-1];
    const deltaFat = +(last.fat - first.fat).toFixed(2);
    const deltaLean = +(last.lean - first.lean).toFixed(2);
    // 4-week rates
    const fourWeeksAgo = addDays(new Date(last.d), -28);
    const prev = [...series].reverse().find(p => p.d <= fourWeeksAgo) || first;
    const weeks = Math.max(1, (last.d - prev.d)/(1000*3600*24)/7);
    const rateFat = +((last.fat - prev.fat)/weeks).toFixed(2);
    const rateLean = +((last.lean - prev.lean)/weeks).toFixed(2);
    // Recomposition count: fat down & lean up vs previous point
    let recomp = 0;
    for (let i=1;i<series.length;i++) {
      if (series[i].fat < series[i-1].fat && series[i].lean > series[i-1].lean) recomp++;
    }
    const lastVals = { fat: last.fat, lean: last.lean, total: last.fat + last.lean };
    return { deltaFat, deltaLean, rateFat, rateLean, recomp, lastVals };
  }, [series]);

  const donutData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: 'Fat', value: summary.lastVals.fat },
      { name: 'Lean', value: summary.lastVals.lean },
    ];
  }, [summary]);

  const COLORS = ['#fb7185', '#34d399'];

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Body Composition Trends</h2>
          <p className="text-sm text-gray-600">Estimated fat vs lean mass {compWindow>0?`(last ${compWindow}d)`:'(all)'}{smooth!=='off'?` • ${smooth.toUpperCase()}`:''}{modePct?' • % mode':''}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">Window</span>
          <select value={compWindow} onChange={(e)=>setCompWindow(parseInt(e.target.value))} className="border rounded-md px-2 py-1 text-sm">
            <option value={30}>1m</option>
            <option value={90}>3m</option>
            <option value={180}>6m</option>
            <option value={0}>All</option>
          </select>
          <span className="text-sm text-gray-600">Smooth</span>
          <select value={smooth} onChange={(e)=>setSmooth(e.target.value)} className="border rounded-md px-2 py-1 text-sm">
            <option value="off">Off</option>
            <option value="ma7">7d</option>
            <option value="ma30">30d</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={modePct} onChange={(e)=>setModePct(e.target.checked)} /> %
          </label>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-3">
          <div className="stat-card">
            <div className="text-sm text-gray-700">Delta since start</div>
            <div className="mt-1 text-gray-900">
              <div className="text-sm">Fat: <span className={summary.deltaFat<=0?'text-emerald-600':'text-rose-600'}>{summary.deltaFat} kg</span></div>
              <div className="text-sm">Lean: <span className={summary.deltaLean>=0?'text-emerald-600':'text-rose-600'}>{summary.deltaLean} kg</span></div>
            </div>
          </div>
          <div className="stat-card">
            <div className="text-sm text-gray-700">Rates (last ~4w)</div>
            <div className="mt-1 text-gray-900">
              <div className="text-sm">Fat: {summary.rateFat} kg/wk</div>
              <div className="text-sm">Lean: {summary.rateLean} kg/wk</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="text-sm text-gray-700">Current Composition</div>
            <div className="flex items-center gap-3">
              <div className="w-28 h-28">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" innerRadius={28} outerRadius={40} paddingAngle={2}>
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v,n)=>`${n}: ${v.toFixed(2)} kg (${(v/summary.lastVals.total*100).toFixed(1)}%)`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-sm text-gray-800">
                <div>Fat: {summary.lastVals.fat.toFixed(2)} kg</div>
                <div>Lean: {summary.lastVals.lean.toFixed(2)} kg</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <AreaChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="dateLabel" />
            {modePct ? (
              <YAxis domain={[0,100]} tickFormatter={(v)=>`${v}%`} />
            ) : (
              <YAxis />
            )}
            <Tooltip content={({ label, payload }) => {
              if (!payload || payload.length===0) return null;
              const d = payload[0].payload;
              const total = d.fat + d.lean;
              return (
                <div className="bg-white rounded shadow p-2 text-sm">
                  <div className="font-medium mb-1">{label}</div>
                  {!modePct ? (
                    <>
                      <div>Fat: {d.fat.toFixed(2)} kg</div>
                      <div>Lean: {d.lean.toFixed(2)} kg</div>
                      <div className="text-gray-600">Total: {total.toFixed(2)} kg</div>
                    </>
                  ) : (
                    <>
                      <div>Fat: {d.fatPct?.toFixed(1)}%</div>
                      <div>Lean: {d.leanPct?.toFixed(1)}%</div>
                    </>
                  )}
                </div>
              );
            }} />
            {!modePct ? (
              <>
                <Area type="monotone" dataKey="fat" stackId="1" stroke="#fb7185" fill="#fecaca" />
                <Area type="monotone" dataKey="lean" stackId="1" stroke="#34d399" fill="#bbf7d0" />
              </>
            ) : (
              <>
                <Area type="monotone" dataKey="fatPct" stackId="1" stroke="#fb7185" fill="#fecaca" />
                <Area type="monotone" dataKey="leanPct" stackId="1" stroke="#34d399" fill="#bbf7d0" />
              </>
            )}
            <Brush dataKey="dateLabel" height={20} stroke="#9ca3af" travellerWidth={8} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {summary && (
        <div className="mt-2 text-xs text-gray-600">Recomposition signals (fat↓ & lean↑): {summary.recomp}</div>
      )}
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
  const currentWeight = dashboard?.stats?.current_weight != null ? parseFloat(dashboard.stats.current_weight) : null;
  const heightCm = dashboard?.user?.height != null ? parseFloat(dashboard.user.height) : null;
  const hM = heightCm ? (heightCm / 100.0) : null;

  // BMI normal range
  const BMI_MIN = 18.5;
  const BMI_MAX = 24.9;
  const weightMin = hM ? BMI_MIN * hM * hM : null;
  const weightMax = hM ? BMI_MAX * hM * hM : null;
  const targetWeight = weightMax != null ? parseFloat(weightMax.toFixed(1)) : null; // default highest weight in normal range
  const targetBMI = BMI_MAX;

  const [weekly, setWeekly] = useState(() => {
    if (currentWeight == null || targetWeight == null) return -0.5;
    const delta = targetWeight - currentWeight;
    return delta >= 0 ? 0.5 : -0.5;
  });

  let finishText = '--';
  if (currentWeight != null && targetWeight != null) {
    const delta = targetWeight - currentWeight; // kg to change
    if (weekly === 0) {
      finishText = 'No change at 0 kg/wk';
    } else if ((delta > 0 && weekly < 0) || (delta < 0 && weekly > 0)) {
      finishText = 'Pace direction does not reach target';
    } else {
      const weeks = Math.abs(delta / weekly);
      const days = Math.round(weeks * 7);
      const finish = addDays(new Date(), days);
      finishText = `${format(finish,'yyyy-MM-dd')} (~${Math.max(1, Math.round(weeks))} wks)`;
    }
  }

  // Projection points for a simple linear path
  const projData = useMemo(() => {
    if (currentWeight == null || targetWeight == null) return [];
    const signOk = (targetWeight >= currentWeight && weekly >= 0) || (targetWeight < currentWeight && weekly <= 0);
    const maxDays = 240;
    const out = [];
    let w = currentWeight;
    const daily = weekly / 7.0;
    const today = new Date();
    out.push({ dateLabel: format(today,'yyyy-MM-dd'), weight: parseFloat(w.toFixed(2)) });
    for (let d = 1; d <= maxDays; d++) {
      w += daily;
      const dt = addDays(today, d);
      out.push({ dateLabel: format(dt,'yyyy-MM-dd'), weight: parseFloat(w.toFixed(2)) });
      if (signOk) {
        if ((daily >= 0 && w >= targetWeight) || (daily < 0 && w <= targetWeight)) break;
      }
    }
    return out;
  }, [currentWeight, targetWeight, weekly]);

  // Build X-axis ticks and formatter based on timeline length
  const xAxis = useMemo(() => {
    if (!projData || projData.length === 0) return { ticks: [], fmt: (x) => x };
    const start = new Date(projData[0].dateLabel);
    const end = new Date(projData[projData.length - 1].dateLabel);
    const totalDays = differenceInCalendarDays(end, start);
    const step = totalDays <= 30 ? 5 : totalDays <= 120 ? 7 : 30; // daily-ish, weekly, monthly
    const ticks = [];
    let d = new Date(start);
    while (d <= end) {
      ticks.push(format(d, 'yyyy-MM-dd'));
      d = addDays(d, step);
    }
    const fmt = (val) => {
      const dt = new Date(val);
      if (totalDays <= 30) return format(dt, 'MMM d');
      if (totalDays <= 120) return format(dt, 'MMM d');
      return format(dt, 'MMM yyyy');
    };
    return { ticks, fmt };
  }, [projData]);

  const weeklyDot = (props) => {
    const { cx, cy, index } = props;
    // Show a small dot roughly each week to avoid clutter
    return index % 7 === 0 ? (
      <circle cx={cx} cy={cy} r={2} fill="#2563eb" stroke="none" />
    ) : null;
  };

  return (
    <div className="stat-card rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-sky-50 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-700 font-medium">Healthy BMI Range Planner</p>
      </div>
      {hM ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm text-gray-800">
            <div>
              <div className="text-xs text-gray-600">BMI Normal Range</div>
              <div className="font-semibold">{BMI_MIN} - {BMI_MAX}</div>
            </div>
            <div>
              <div className="text-xs text-gray-600">Weight Range (kg)</div>
              <div className="font-semibold">{weightMin?.toFixed(1)} - {weightMax?.toFixed(1)} kg</div>
            </div>
            <div>
              <div className="text-xs text-gray-600">Target (highest normal)</div>
              <div className="font-semibold">{targetWeight?.toFixed(1)} kg (BMI {targetBMI})</div>
            </div>
            <div>
              <div className="text-xs text-gray-600">Current</div>
              <div className="font-semibold">{currentWeight != null ? `${currentWeight.toFixed(1)} kg` : '--'}</div>
            </div>
          </div>

          <div>
            <input type="range" min={-1.5} max={1.5} step={0.1} value={weekly} onChange={(e)=>setWeekly(parseFloat(e.target.value))} className="w-full" />
            <div className="mt-1 text-sm text-gray-700">Selected weekly change: {weekly.toFixed(1)} kg/week</div>
            <div className="text-sm text-gray-700">Estimated finish: {finishText}</div>
          </div>

          <div className="rounded-lg border border-emerald-100 bg-white/60" style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={projData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#374151' }} minTickGap={18} ticks={xAxis.ticks} tickFormatter={xAxis.fmt} />
                <YAxis tick={{ fontSize: 12 }} domain={['auto','auto']} />
                <Tooltip formatter={(v) => `${v} kg`} labelFormatter={(l) => l} />
                <Line type="monotone" dataKey="weight" stroke="#2563eb" strokeWidth={2} dot={weeklyDot} activeDot={{ r: 3 }} name="Projected" />
                {targetWeight != null && (
                  <ReferenceLine y={targetWeight} stroke="#10b981" strokeDasharray="4 4" label={{ value: `Target ${targetWeight.toFixed(1)} kg`, position: 'left', fill: '#065f46', fontSize: 12 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-700">Add your height in profile to view BMI-based healthy range planning.</p>
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

  // Normalize statuses (DB may use: Success, Failed, active, cancelled, completed)
  const statusCounts = t.reduce((acc, x) => {
    let s = (x.status || 'unknown').toString().toLowerCase();
    if (s === 'success' || s === 'completed') s = 'success';
    else if (s === 'failed') s = 'failed';
    else if (s === 'cancelled') s = 'cancelled';
    else if (s === 'active') s = 'active';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const total = t.length;
  const successes = statusCounts['success'] || 0;
  const failed = statusCounts['failed'] || 0;
  const cancelled = statusCounts['cancelled'] || 0;
  const active = statusCounts['active'] || 0;
  // Success rate considers only resolved outcomes (success vs failed)
  const denom = successes + failed;
  const successRate = denom ? Math.round((successes / denom) * 100) : 0;

  const COLORS = ['#10b981', '#ef4444', '#60a5fa', '#9ca3af'];
  const pieData = [
    { name: 'Success', value: successes },
    { name: 'Failed', value: failed },
    { name: 'Active', value: active },
    { name: 'Cancelled', value: cancelled },
  ].filter(d => d.value > 0);

  // Three cards horizontally, same height
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 items-stretch">
      <div className="stat-card h-full flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">Total Targets</p>
        </div>
        <div className="text-4xl font-bold text-gray-900 mt-2">{total}</div>
        <div className="text-xs text-gray-500 mt-2">Across all time</div>
      </div>
      <div className="stat-card h-full flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">Success Rate</p>
        </div>
        <div className="text-4xl font-bold text-gray-900 mt-2">{successRate}%</div>
        <div className="text-xs text-gray-500 mt-2">Resolved goals (Success vs Failed)</div>
      </div>
      <div className="stat-card h-full flex flex-col">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">Outcomes Breakdown</p>
        </div>
        <div className="flex-1 min-h-[180px]">
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
    </div>
  );
}
