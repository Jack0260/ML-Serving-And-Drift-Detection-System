import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ModelVersion, ModelStage } from '@/lib/types';
import { Badge } from '@/components/Badge';
import { formatTimestamp } from '@/lib/constants';
import { Layers, Cpu, ArrowUpRight, Archive } from 'lucide-react';

export function ModelsView() {
  const [models, setModels] = useState<ModelVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from('model_versions')
      .select('*')
      .order('version', { ascending: false })
      .then(({ data }) => {
        setModels((data as ModelVersion[]) ?? []);
        setLoading(false);
      });
  }, []);

  async function updateStage(version: number, stage: ModelStage) {
    setUpdating(version);
    await supabase.from('model_versions').update({ stage }).eq('version', version);

    if (stage === 'production') {
      await supabase
        .from('model_versions')
        .update({ stage: 'archived' })
        .neq('version', version)
        .eq('stage', 'production');
      await supabase
        .from('routing_config')
        .update({ production_version: version, updated_at: new Date().toISOString() })
        .eq('id', 1);
    }

    const refreshed = await supabase.from('model_versions').select('*').order('version', { ascending: false });
    setModels((refreshed.data as ModelVersion[]) ?? []);
    setUpdating(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Model Versions</h2>
        <p className="text-sm text-slate-400 mt-1">All registered model versions from MLflow with lifecycle management</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {models.map((model) => (
          <div
            key={model.id}
            className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800">
                  <Cpu className="h-5 w-5 text-sky-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Version {model.version}</h3>
                  <p className="text-xs text-slate-500">Run: {model.mlflow_run_id}</p>
                </div>
              </div>
              <Badge stage={model.stage}>{model.stage}</Badge>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-5 gap-2 mb-4">
              {(['accuracy', 'f1', 'precision', 'recall', 'auc'] as const).map((key) => {
                const val = model.metrics[key];
                return (
                  <div key={key} className="bg-slate-950/40 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">{key}</p>
                    <p className="text-sm font-mono font-semibold text-slate-200 mt-0.5">
                      {val != null ? val.toFixed(3) : '—'}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Params */}
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-1.5">Training Parameters</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(model.params).map(([key, val]) => (
                  <span
                    key={key}
                    className="text-xs bg-slate-800/50 text-slate-300 rounded-md px-2 py-1 font-mono"
                  >
                    {key}: {val}
                  </span>
                ))}
              </div>
            </div>

            {/* Features */}
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-1.5">{model.feature_names.length} Features</p>
              <p className="text-xs text-slate-400 font-mono truncate">
                {model.feature_names.join(', ')}
              </p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-xs text-slate-500">Trained {formatTimestamp(model.trained_at)}</span>
              <div className="flex items-center gap-2">
                {model.stage !== 'production' && (
                  <button
                    onClick={() => updateStage(model.version, 'production')}
                    disabled={updating === model.version}
                    className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 px-2.5 py-1.5 rounded-md border border-emerald-500/20 hover:border-emerald-500/40 transition-colors disabled:opacity-50"
                  >
                    <ArrowUpRight className="h-3 w-3" /> Promote
                  </button>
                )}
                {model.stage === 'production' && (
                  <button
                    onClick={() => updateStage(model.version, 'archived')}
                    disabled={updating === model.version}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300 px-2.5 py-1.5 rounded-md border border-slate-700 hover:border-slate-600 transition-colors disabled:opacity-50"
                  >
                    <Archive className="h-3 w-3" /> Archive
                  </button>
                )}
                {model.stage === 'challenger' && (
                  <button
                    onClick={() => updateStage(model.version, 'archived')}
                    disabled={updating === model.version}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300 px-2.5 py-1.5 rounded-md border border-slate-700 hover:border-slate-600 transition-colors disabled:opacity-50"
                  >
                    <Archive className="h-3 w-3" /> Archive
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {models.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
          <Layers className="h-12 w-12 mb-3 opacity-50" />
          <p>No model versions registered yet</p>
        </div>
      )}
    </div>
  );
}
