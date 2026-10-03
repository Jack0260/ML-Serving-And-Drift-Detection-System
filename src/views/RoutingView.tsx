import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ModelVersion, RoutingConfig, RoutingMode } from '@/lib/types';
import { useRoutingConfig } from '@/hooks/useRoutingConfig';
import { Badge } from '@/components/Badge';
import { GitBranch, ArrowRight, Save, Eye, Shuffle, Target } from 'lucide-react';

export function RoutingView() {
  const { config, setConfig, loading } = useRoutingConfig();
  const [models, setModels] = useState<ModelVersion[]>([]);
  const [mode, setMode] = useState<RoutingMode>('single');
  const [challengerVersion, setChallengerVersion] = useState<number | null>(null);
  const [trafficSplit, setTrafficSplit] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from('model_versions')
      .select('*')
      .order('version', { ascending: false })
      .then(({ data }) => {
        setModels((data as ModelVersion[]) ?? []);
      });
  }, []);

  useEffect(() => {
    if (config) {
      setMode(config.mode);
      setChallengerVersion(config.challenger_version);
      setTrafficSplit(config.traffic_split_pct);
    }
  }, [config]);

  const productionModel = models.find((m) => m.version === config?.production_version);
  const challengerModel = models.find((m) => m.version === challengerVersion);
  const availableChallengers = models.filter(
    (m) => m.version !== config?.production_version && m.stage !== 'archived'
  );

  async function handleSave() {
    setSaving(true);
    const updates: Partial<RoutingConfig> = {
      mode,
      challenger_version: mode === 'single' ? null : challengerVersion,
      traffic_split_pct: mode === 'single' ? 0 : trafficSplit,
      updated_at: new Date().toISOString(),
    };

    const { data } = await supabase
      .from('routing_config')
      .update(updates)
      .eq('id', 1)
      .select()
      .maybeSingle();

    if (data) setConfig(data as RoutingConfig);

    if (mode !== 'single' && challengerVersion) {
      await supabase.from('model_versions').update({ stage: 'challenger' }).eq('version', challengerVersion);
      await supabase
        .from('model_versions')
        .update({ stage: 'staging' })
        .neq('version', challengerVersion)
        .eq('stage', 'challenger');
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const modeOptions: { value: RoutingMode; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'single', label: 'Single Model', desc: 'All traffic goes to production', icon: Target },
    { value: 'shadow', label: 'Shadow Mode', desc: 'Challenger runs silently, predictions logged but not returned', icon: Eye },
    { value: 'ab_test', label: 'A/B Test', desc: 'Traffic split between production and challenger', icon: Shuffle },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Model Routing</h2>
        <p className="text-sm text-slate-400 mt-1">Configure how prediction traffic is distributed between model versions</p>
      </div>

      {/* Current state */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <GitBranch className="h-4 w-4 text-sky-400" />
          <h3 className="text-sm font-semibold">Current Configuration</h3>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex-1 bg-slate-950/40 rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Production Model</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-emerald-400">v{config?.production_version}</span>
              <Badge stage="production">production</Badge>
            </div>
            {productionModel && (
              <p className="text-xs text-slate-500 mt-1">
                AUC: {productionModel.metrics.auc?.toFixed(3)} · Acc: {productionModel.metrics.accuracy?.toFixed(3)}
              </p>
            )}
          </div>

          {config && config.mode !== 'single' && (
            <>
              <ArrowRight className="h-5 w-5 text-slate-600" />
              <div className="flex-1 bg-slate-950/40 rounded-lg p-4">
                <p className="text-xs text-slate-500 mb-1">Challenger Model</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-violet-300">v{config.challenger_version}</span>
                  <Badge stage="challenger">challenger</Badge>
                </div>
                {challengerModel && (
                  <p className="text-xs text-slate-500 mt-1">
                    AUC: {challengerModel.metrics.auc?.toFixed(3)} · Acc: {challengerModel.metrics.accuracy?.toFixed(3)}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold mb-5">Routing Mode</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {modeOptions.map((opt) => {
            const Icon = opt.icon;
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className={`p-4 rounded-lg border text-left transition-all ${
                  active
                    ? 'border-sky-500/40 bg-sky-500/5'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-900/30'
                }`}
              >
                <Icon className={`h-5 w-5 mb-2 ${active ? 'text-sky-400' : 'text-slate-500'}`} />
                <p className={`text-sm font-medium ${active ? 'text-sky-300' : 'text-slate-300'}`}>{opt.label}</p>
                <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
              </button>
            );
          })}
        </div>

        {mode !== 'single' && (
          <>
            <div className="mb-6">
              <label className="text-xs text-slate-500 mb-2 block">Challenger Model</label>
              <select
                value={challengerVersion ?? ''}
                onChange={(e) => setChallengerVersion(Number(e.target.value))}
                className="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50"
              >
                <option value="">Select a model version</option>
                {availableChallengers.map((m) => (
                  <option key={m.version} value={m.version}>
                    v{m.version} — AUC: {m.metrics.auc?.toFixed(3)} · Acc: {m.metrics.accuracy?.toFixed(3)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs text-slate-500">Traffic Split</label>
                <span className="text-sm font-mono text-slate-300">
                  {100 - trafficSplit}% production / {trafficSplit}% challenger
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={trafficSplit}
                onChange={(e) => setTrafficSplit(Number(e.target.value))}
                className="w-full accent-sky-500"
              />
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-800 mt-3">
                <div className="bg-emerald-500 transition-all" style={{ width: `${100 - trafficSplit}%` }} />
                <div className="bg-violet-500 transition-all" style={{ width: `${trafficSplit}%` }} />
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-500 px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          {saved && (
            <span className="text-sm text-emerald-400 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Configuration saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
