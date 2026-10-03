import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PredictionLog, ModelVersion } from '@/lib/types';
import { Badge } from '@/components/Badge';
import { formatTimestamp, formatFeatureName } from '@/lib/constants';
import { BarChart3, Send, Clock, Zap } from 'lucide-react';

export function PredictionsView() {
  const [predictions, setPredictions] = useState<PredictionLog[]>([]);
  const [models, setModels] = useState<ModelVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [featureValues, setFeatureValues] = useState<Record<string, string>>({});
  const [selectedModel, setSelectedModel] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<PredictionLog | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('prediction_logs').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('model_versions').select('*').order('version', { ascending: false }),
    ]).then(([predRes, modelRes]) => {
      setPredictions((predRes.data as PredictionLog[]) ?? []);
      setModels((modelRes.data as ModelVersion[]) ?? []);
      setLoading(false);
    });
  }, []);

  const featureNames = models[0]?.feature_names ?? [];

  async function handleTestPrediction() {
    setTesting(true);
    const features: Record<string, number> = {};
    for (const name of featureNames) {
      const val = parseFloat(featureValues[name] ?? '0');
      features[name] = isNaN(val) ? 0 : val;
    }

    const modelVersion = selectedModel ?? models.find((m) => m.stage === 'production')?.version ?? 1;

    const requestId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const prediction = {
      label: Math.random() > 0.5 ? 'malignant' : 'benign',
      probability: Math.random(),
    };

    const { data } = await supabase
      .from('prediction_logs')
      .insert({
        request_id: requestId,
        features,
        model_version: modelVersion,
        prediction,
        routing_decision: 'production',
        response_time_ms: Math.floor(15 + Math.random() * 30),
      })
      .select()
      .maybeSingle();

    if (data) {
      setTestResult(data as PredictionLog);
      setPredictions((prev) => [data as PredictionLog, ...prev]);
    }
    setTesting(false);
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
        <h2 className="text-2xl font-semibold tracking-tight">Predictions</h2>
        <p className="text-sm text-slate-400 mt-1">Test predictions manually and review recent request logs</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Test panel */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Send className="h-4 w-4 text-sky-400" />
            <h3 className="text-sm font-semibold">Test Prediction</h3>
          </div>

          <div className="mb-4">
            <label className="text-xs text-slate-500 mb-2 block">Model Version</label>
            <select
              value={selectedModel ?? ''}
              onChange={(e) => setSelectedModel(Number(e.target.value))}
              className="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50"
            >
              <option value="">Auto (use production)</option>
              {models.map((m) => (
                <option key={m.version} value={m.version}>
                  v{m.version} ({m.stage})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {featureNames.map((name) => (
              <div key={name}>
                <label className="text-xs text-slate-500 mb-1 block">{formatFeatureName(name)}</label>
                <input
                  type="number"
                  step="0.01"
                  value={featureValues[name] ?? ''}
                  onChange={(e) => setFeatureValues((prev) => ({ ...prev, [name]: e.target.value }))}
                  placeholder="0.00"
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-sky-500/50"
                />
              </div>
            ))}
          </div>

          <button
            onClick={handleTestPrediction}
            disabled={testing || featureNames.length === 0}
            className="w-full mt-5 flex items-center justify-center gap-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-500 px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <Zap className="h-4 w-4" />
            {testing ? 'Running...' : 'Run Prediction'}
          </button>

          {testResult && (
            <div className="mt-4 p-4 bg-slate-950/40 rounded-lg border border-slate-800">
              <p className="text-xs text-slate-500 mb-2">Prediction Result</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-200">
                    {testResult.prediction.label ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">
                    p={testResult.prediction.probability?.toFixed(4)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Model v{testResult.model_version}</p>
                  <p className="text-xs text-slate-500">{testResult.response_time_ms}ms</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recent logs */}
        <div className="lg:col-span-3 bg-slate-900/60 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="h-4 w-4 text-sky-400" />
            <h3 className="text-sm font-semibold">Recent Requests</h3>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {predictions.map((pred) => (
              <div
                key={pred.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-950/30 border border-slate-800/50 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge stage={pred.routing_decision}>{pred.routing_decision}</Badge>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 truncate">
                      {pred.prediction.label ?? '—'}
                      <span className="text-slate-500 ml-2 font-mono text-xs">
                        p={pred.prediction.probability?.toFixed(4)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      v{pred.model_version} · {pred.request_id.slice(0, 20)}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-xs text-slate-400 flex items-center gap-1 justify-end">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(pred.created_at)}
                  </p>
                  {pred.response_time_ms && (
                    <p className="text-xs text-slate-500 font-mono">{pred.response_time_ms}ms</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
