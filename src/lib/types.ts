export type ModelStage = 'production' | 'staging' | 'archived' | 'challenger';

export interface ModelMetrics {
  accuracy?: number;
  f1?: number;
  precision?: number;
  recall?: number;
  auc?: number;
}

export interface ModelVersion {
  id: string;
  version: number;
  mlflow_run_id: string;
  stage: ModelStage;
  metrics: ModelMetrics;
  params: Record<string, number | string>;
  artifact_path: string;
  feature_names: string[];
  trained_at: string;
  created_at: string;
}

export type RoutingMode = 'shadow' | 'ab_test' | 'single';

export interface RoutingConfig {
  id: number;
  production_version: number;
  challenger_version: number | null;
  traffic_split_pct: number;
  mode: RoutingMode;
  updated_at: string;
}

export type RoutingDecision = 'production' | 'challenger' | 'shadow';

export interface PredictionLog {
  id: string;
  request_id: string;
  features: Record<string, number>;
  model_version: number;
  prediction: {
    label?: string;
    probability?: number;
  };
  routing_decision: RoutingDecision;
  response_time_ms: number | null;
  created_at: string;
}

export type DriftSeverity = 'stable' | 'warning' | 'critical';

export interface DriftMetric {
  id: string;
  feature_name: string;
  psi: number;
  ks_statistic: number;
  ks_pvalue: number;
  severity: DriftSeverity;
  sample_size: number;
  window_start: string;
  window_end: string;
  created_at: string;
}

export type RetrainStatus = 'queued' | 'running' | 'completed' | 'failed';
export type RetrainTrigger = 'manual' | 'drift' | 'scheduled';

export interface RetrainJob {
  id: string;
  status: RetrainStatus;
  triggered_by: RetrainTrigger;
  trigger_reason: string;
  new_version: number | null;
  drift_features: string[];
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}
