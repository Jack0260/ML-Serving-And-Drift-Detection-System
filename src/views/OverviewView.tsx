import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ModelVersion, DriftMetric, RetrainJob } from '@/lib/types';
import { formatRelativeTime } from '@/lib/constants';
import { Badge } from '@/components/Badge';
import { useRoutingConfig } from '@/hooks/useRoutingConfig';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Clock,
  ArrowRight,
  Activity,
  Cpu,
  GitBranch,
} from 'lucide-react';

interface OverviewViewProps {
  onNavigate: (view: 'overview' | 'drift' | 'models' | 'routing' | 'predictions' | 'retraining') => void;
}

export function OverviewView({ onNavigate }: OverviewViewProps) {
  const [prodModel, setProdModel] = useState<ModelVersion | null>(null);
  const [latestDrift, setLatestDrift] = useState<DriftMetric[]>([]);
  const [totalPredictions, setTotalPredictions] = useState(0);
  const [recentJobs, setRecentJobs] = useState<RetrainJob[]>([]);
  const { config } = useRoutingConfig();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('model_versions').select('*').eq('stage', 'production').maybeSingle(),
      supabase.from('drift_metrics').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('prediction_logs').select('id', { count: 'exact', head: true }),
      supabase.from('retrain_jobs').select('*').order('created_at', { ascending: false }).limit(5),
    ]).then(([modelRes, driftRes, predRes, jobsRes]) => {
      setProdModel(modelRes.data as ModelVersion | null);
      setLatestDrift((driftRes.data as DriftMetric[]) ?? []);
      setTotalPredictions(predRes.count ?? 0);
      setRecentJobs((jobsRes.data as RetrainJob[]) ?? []);
      setLoading(false);
    });
  }, []);

  const criticalCount = latestDrift.filter((d) => d.severity === 'critical').length;
  const warningCount = latestDrift.filter((d) => d.severity === 'warning').length;
  const stableCount = latestDrift.filter((d) => d.severity === 'stable').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const cards = [
    {
      label: 'Total Predictions',
      value: totalPredictions.toLocaleString(),
      icon: Zap,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
      sub: 'All-time requests served',
    },
    {
      label: 'Production Model',
      value: `v${prodModel?.version ?? '—'}`,
      icon: Cpu,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      sub: prodModel ? `AUC: ${(prodModel.metrics.auc ?? 0).toFixed(3)}` : 'No model deployed',
    },
    {
      label: 'Critical Drift',
      value: criticalCount.toString(),
      icon: AlertTriangle,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
      sub: criticalCount > 0 ? 'Retraining recommended' : 'All features stable',
    },
    {
      label: 'Warning Drift',
      value: warningCount.toString(),
      icon: TrendingUp,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      sub: 'Features approaching threshold',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">System Overview</h2>
        <p className="text-sm text-slate-400 mt-1">Real-time status of your ML serving infrastructure</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.bg}`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
              <p className="text-2xl font-semibold tracking-tight">{card.value}</p>
              <p className="text-sm text-slate-400 mt-1">{card.label}</p>
              <p className="text-xs text-slate-500 mt-2">{card.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Drift summary */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-sky-400" />
              <h3 className="text-sm font-semibold">Feature Drift Status</h3>
            </div>
            <button
              onClick={() => onNavigate('drift')}
              className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
            >
              View details <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-2.5">
            {latestDrift.slice(0, 6).map((metric) => {
              const pct = Math.min((metric.psi / 0.35) * 100, 100);
              return (
                <div key={metric.id} className="flex items-center gap-3">
                  <div className="w-36 text-sm text-slate-300 truncate">
                    {metric.feature_name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </div>
                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
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
                  <div className="w-20 text-right text-sm font-mono text-slate-400">
                    PSI {metric.psi.toFixed(3)}
                  </div>
                  <Badge severity={metric.severity}>{metric.severity}</Badge>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-6 mt-5 pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-slate-400">{stableCount} stable</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <TrendingUp className="h-4 w-4 text-amber-400" />
              <span className="text-slate-400">{warningCount} warning</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              <span className="text-slate-400">{criticalCount} critical</span>
            </div>
          </div>
        </div>

        {/* Routing status */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <GitBranch className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold">Routing Status</h3>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Mode</p>
              <div className="flex items-center gap-2">
                <Badge stage={config?.mode}>{config?.mode?.replace('_', ' ') ?? '—'}</Badge>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Production</p>
                <p className="text-sm font-semibold text-emerald-400">v{config?.production_version ?? '—'}</p>
              </div>
              {config?.challenger_version && (
                <>
                  <ArrowRight className="h-4 w-4 text-slate-600" />
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Challenger</p>
                    <p className="text-sm font-semibold text-violet-300">v{config.challenger_version}</p>
                  </div>
                </>
              )}
            </div>

            {config && config.mode !== 'single' && (
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                  <span>Traffic split</span>
                  <span>{100 - config.traffic_split_pct}% / {config.traffic_split_pct}%</span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-slate-800">
                  <div className="bg-emerald-500" style={{ width: `${100 - config.traffic_split_pct}%` }} />
                  <div className="bg-violet-500" style={{ width: `${config.traffic_split_pct}%` }} />
                </div>
              </div>
            )}

            <button
              onClick={() => onNavigate('routing')}
              className="w-full text-xs text-sky-400 hover:text-sky-300 flex items-center justify-center gap-1 py-2 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors"
            >
              Configure routing <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Recent retrain jobs */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-sky-400" />
            <h3 className="text-sm font-semibold">Recent Retraining Activity</h3>
          </div>
          <button
            onClick={() => onNavigate('retraining')}
            className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
          >
            View all <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-3">
          {recentJobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between py-2.5 border-b border-slate-800 last:border-0">
              <div className="flex items-center gap-3">
                <Badge status={job.status}>{job.status}</Badge>
                <div>
                  <p className="text-sm text-slate-200">{job.trigger_reason}</p>
                  <p className="text-xs text-slate-500">
                    {job.triggered_by} trigger · {formatRelativeTime(job.created_at)}
                  </p>
                </div>
              </div>
              {job.new_version && (
                <span className="text-sm font-mono text-emerald-400">→ v{job.new_version}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


