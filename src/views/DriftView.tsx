import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { DriftMetric } from '@/lib/types';
import { PSI_WARNING_THRESHOLD, PSI_CRITICAL_THRESHOLD, formatFeatureName } from '@/lib/constants';
import { Badge } from '@/components/Badge';
import { Activity, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

export function DriftView() {
  const [allMetrics, setAllMetrics] = useState<DriftMetric[]>([]);
  const [historyMetrics, setHistoryMetrics] = useState<DriftMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase
        .from('drift_metrics')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('drift_metrics')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(500),
    ]).then(([latest, history]) => {
      setAllMetrics((latest.data as DriftMetric[]) ?? []);
      setHistoryMetrics((history.data as DriftMetric[]) ?? []);
      setLoading(false);
    });
  }, []);

  const latestPerFeature = useMemo(() => {
    const map = new Map<string, DriftMetric>();
    for (const m of allMetrics) {
      if (!map.has(m.feature_name)) map.set(m.feature_name, m);
    }
    return Array.from(map.values()).sort((a, b) => b.psi - a.psi);
  }, [allMetrics]);

  const historyByFeature = useMemo(() => {
    const map = new Map<string, DriftMetric[]>();
    for (const m of historyMetrics) {
      const arr = map.get(m.feature_name) ?? [];
      arr.push(m);
      map.set(m.feature_name, arr);
    }
    return map;
  }, [historyMetrics]);

  const criticalCount = latestPerFeature.filter((d) => d.severity === 'critical').length;
  const warningCount = latestPerFeature.filter((d) => d.severity === 'warning').length;
  const stableCount = latestPerFeature.filter((d) => d.severity === 'stable').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectedHistory = selectedFeature ? historyByFeature.get(selectedFeature) ?? [] : [];
  const maxPsi = Math.max(...latestPerFeature.map((d) => d.psi), 0.35);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Drift Monitor</h2>
          <p className="text-sm text-slate-400 mt-1">
            Population Stability Index (PSI) and Kolmogorov-Smirnov test per feature
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
          </div>
          <div>
            <p className="text-2xl font-semibold">{criticalCount}</p>
            <p className="text-xs text-slate-400">Critical (PSI ≥ {PSI_CRITICAL_THRESHOLD})</p>
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
            <TrendingUp className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-semibold">{warningCount}</p>
            <p className="text-xs text-slate-400">Warning (PSI ≥ {PSI_WARNING_THRESHOLD})</p>
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
            <TrendingDown className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-semibold">{stableCount}</p>
            <p className="text-xs text-slate-400">Stable (PSI {'<'} {PSI_WARNING_THRESHOLD})</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Feature list with PSI bars */}
        <div className="lg:col-span-3 bg-slate-900/60 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Activity className="h-4 w-4 text-sky-400" />
            <h3 className="text-sm font-semibold">Per-Feature Drift Scores</h3>
          </div>

          <div className="space-y-3">
            {latestPerFeature.map((metric) => {
              const pct = Math.min((metric.psi / maxPsi) * 100, 100);
              const isSelected = selectedFeature === metric.feature_name;
              return (
                <button
                  key={metric.id}
                  onClick={() => setSelectedFeature(metric.feature_name)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'border-sky-500/40 bg-sky-500/5'
                      : 'border-slate-800 hover:border-slate-700 bg-slate-900/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">
                        {formatFeatureName(metric.feature_name)}
                      </span>
                      <Badge severity={metric.severity}>{metric.severity}</Badge>
                    </div>
                    <span className="text-sm font-mono text-slate-400">
                      PSI {metric.psi.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        metric.severity === 'critical'
                          ? 'bg-rose-500'
                          : metric.severity === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span>KS stat: {metric.ks_statistic.toFixed(4)}</span>
                    <span>p-value: {metric.ks_pvalue.toFixed(4)}</span>
                    <span>n={metric.sample_size}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* History chart for selected feature */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-5">
            {selectedFeature ? `${formatFeatureName(selectedFeature)} — PSI Trend` : 'Select a feature to view history'}
          </h3>

          {selectedFeature && selectedHistory.length > 0 ? (
            <div>
              <div className="relative h-64 bg-slate-950/50 rounded-lg border border-slate-800 p-3">
                <SparklineChart
                  data={selectedHistory.map((m) => m.psi)}
                  labels={selectedHistory.map((m) => m.created_at)}
                  thresholdWarning={PSI_WARNING_THRESHOLD}
                  thresholdCritical={PSI_CRITICAL_THRESHOLD}
                />
              </div>

              <div className="space-y-2 mt-4">
                <div className="flex items-center gap-2 text-xs">
                  <div className="h-1 w-4 bg-amber-500 rounded-full" />
                  <span className="text-slate-400">Warning threshold ({PSI_WARNING_THRESHOLD})</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="h-1 w-4 bg-rose-500 rounded-full" />
                  <span className="text-slate-400">Critical threshold ({PSI_CRITICAL_THRESHOLD})</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-800">
                <div>
                  <p className="text-xs text-slate-500">Current PSI</p>
                  <p className={`text-lg font-semibold ${
                    selectedHistory[selectedHistory.length - 1].severity === 'critical'
                      ? 'text-rose-400'
                      : selectedHistory[selectedHistory.length - 1].severity === 'warning'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                  }`}>
                    {selectedHistory[selectedHistory.length - 1].psi.toFixed(4)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Trend (7 periods)</p>
                  <p className="text-lg font-semibold text-slate-300">
                    {selectedHistory.length >= 7
                      ? (selectedHistory[selectedHistory.length - 1].psi > selectedHistory[selectedHistory.length - 7].psi ? '↑' : '↓')
                      : '—'}
                    {' '}
                    {selectedHistory.length >= 7
                      ? Math.abs(selectedHistory[selectedHistory.length - 1].psi - selectedHistory[selectedHistory.length - 7].psi).toFixed(4)
                      : ''}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-sm text-slate-500">
              Click a feature on the left to see its drift history
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SparklineChart({
  data,
  thresholdWarning,
  thresholdCritical,
}: {
  data: number[];
  labels: string[];
  thresholdWarning: number;
  thresholdCritical: number;
}) {
  const maxVal = Math.max(...data, thresholdCritical * 1.2);
  const width = 100;
  const height = 100;

  const points = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = height - (v / maxVal) * height;
    return `${x},${y}`;
  });

  const warningY = height - (thresholdWarning / maxVal) * height;
  const criticalY = height - (thresholdCritical / maxVal) * height;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
      {/* Threshold lines */}
      <line x1="0" y1={warningY} x2={width} y2={warningY} stroke="rgb(245 158 11)" strokeWidth="0.3" strokeDasharray="2,1" />
      <line x1="0" y1={criticalY} x2={width} y2={criticalY} stroke="rgb(244 63 94)" strokeWidth="0.3" strokeDasharray="2,1" />

      {/* Area fill */}
      <polygon
        points={`0,${height} ${points.join(' ')} ${width},${height}`}
        fill="rgb(56 189 248)"
        fillOpacity="0.1"
      />

      {/* Line */}
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="rgb(56 189 248)"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
      />

      {/* Dots */}
      {data.map((_, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * width;
        const y = height - (data[i] / maxVal) * height;
        const isCritical = data[i] >= thresholdCritical;
        const isWarning = data[i] >= thresholdWarning && data[i] < thresholdCritical;
        const color = isCritical ? 'rgb(244 63 94)' : isWarning ? 'rgb(245 158 11)' : 'rgb(52 211 153)';
        return <circle key={i} cx={x} cy={y} r="0.8" fill={color} />;
      })}
    </svg>
  );
}
