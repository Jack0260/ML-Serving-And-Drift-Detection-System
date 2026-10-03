import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { RetrainJob } from '@/lib/types';
import { Badge } from '@/components/Badge';
import { formatTimestamp, formatRelativeTime } from '@/lib/constants';
import { RotateCw, Plus, AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';

const statusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  completed: CheckCircle2,
  running: Loader2,
  queued: Clock,
  failed: XCircle,
};

export function RetrainingView() {
  const [jobs, setJobs] = useState<RetrainJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    supabase
      .from('retrain_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setJobs((data as RetrainJob[]) ?? []);
        setLoading(false);
      });
  }, []);

  async function handleTriggerRetrain() {
    setTriggering(true);
    const { data } = await supabase
      .from('retrain_jobs')
      .insert({
        status: 'queued',
        triggered_by: 'manual',
        trigger_reason: 'Manual retraining triggered from dashboard',
      })
      .select()
      .maybeSingle();

    if (data) {
      setJobs((prev) => [data as RetrainJob, ...prev]);
      setTriggered(true);
      setTimeout(() => setTriggered(false), 3000);
    }
    setTriggering(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  const completedJobs = jobs.filter((j) => j.status === 'completed' || j.status === 'failed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Retraining</h2>
          <p className="text-sm text-slate-400 mt-1">Monitor and trigger model retraining pipelines</p>
        </div>
        <button
          onClick={handleTriggerRetrain}
          disabled={triggering}
          className="flex items-center gap-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-500 px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {triggering ? 'Triggering...' : 'Trigger Retraining'}
        </button>
      </div>

      {triggered && (
        <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
          <CheckCircle2 className="h-4 w-4" />
          Retraining job queued successfully
        </div>
      )}

      {/* Active jobs */}
      {activeJobs.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-4">Active Jobs</h3>
          <div className="space-y-3">
            {activeJobs.map((job) => {
              const Icon = statusIcons[job.status] ?? Clock;
              return (
                <div key={job.id} className="flex items-center gap-4 p-4 rounded-lg bg-slate-950/40 border border-slate-800">
                  <Icon className={`h-5 w-5 ${job.status === 'running' ? 'text-sky-400 animate-spin' : 'text-slate-400'}`} />
                  <div className="flex-1">
                    <p className="text-sm text-slate-200">{job.trigger_reason}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {job.triggered_by} trigger · {formatRelativeTime(job.created_at)}
                    </p>
                  </div>
                  <Badge status={job.status}>{job.status}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drift-triggered recommendation */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 shrink-0">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-300">Drift-Based Retraining Recommendation</h3>
          <p className="text-sm text-slate-400 mt-1">
            3 features have critical PSI drift (mean_radius, mean_perimeter, mean_area).
            Retraining with recent prediction data is recommended to restore model accuracy.
          </p>
          <button
            onClick={handleTriggerRetrain}
            disabled={triggering}
            className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-300 hover:text-amber-200 px-3 py-1.5 rounded-md border border-amber-500/30 hover:border-amber-500/50 transition-colors disabled:opacity-50"
          >
            <RotateCw className="h-3 w-3" />
            Retrain now (drift-triggered)
          </button>
        </div>
      </div>

      {/* Job history */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold mb-4">Retraining History</h3>

        <div className="space-y-2">
          {completedJobs.map((job) => {
            const Icon = statusIcons[job.status] ?? Clock;
            return (
              <div
                key={job.id}
                className="flex items-center gap-4 p-3 rounded-lg bg-slate-950/30 border border-slate-800/50"
              >
                <Icon className={`h-4 w-4 shrink-0 ${
                  job.status === 'completed' ? 'text-emerald-400' : 'text-rose-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{job.trigger_reason}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-slate-500">{formatRelativeTime(job.created_at)}</span>
                    {job.drift_features.length > 0 && (
                      <span className="text-xs text-slate-500">
                        Drift: {job.drift_features.join(', ')}
                      </span>
                    )}
                    {job.error_message && (
                      <span className="text-xs text-rose-400">{job.error_message}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {job.new_version && (
                    <span className="text-sm font-mono text-emerald-400">v{job.new_version}</span>
                  )}
                  <Badge status={job.status}>{job.status}</Badge>
                  <span className="text-xs text-slate-500 hidden sm:block">{formatTimestamp(job.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {completedJobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <RotateCw className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No retraining history yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
