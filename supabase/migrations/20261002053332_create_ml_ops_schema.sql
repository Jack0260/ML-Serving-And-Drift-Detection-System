/*
# Create ML Operations Schema

## Overview
This migration creates the complete database schema for a train-to-serve ML system
with drift detection, model versioning, shadow/A-B routing, and retraining management.

## New Tables

### 1. model_versions
Stores metadata for every model version registered from MLflow.
- `id` (uuid, primary key)
- `version` (int, unique version number assigned by MLflow)
- `mlflow_run_id` (text, the MLflow tracking run ID)
- `stage` (text, one of: production, staging, archived, challenger)
- `metrics` (jsonb, training metrics like accuracy, f1, precision, recall)
- `params` (jsonb, training hyperparameters)
- `artifact_path` (text, path to the saved model artifact)
- `feature_names` (text[], ordered list of feature names the model expects)
- `trained_at` (timestamptz, when training completed)

### 2. routing_config
Single-row configuration table controlling model routing behavior.
- `id` (int, primary key, always 1 — singleton)
- `production_version` (int, version number of the production model)
- `challenger_version` (int, version number of the challenger/shadow model, nullable)
- `traffic_split_pct` (int, percentage of traffic sent to challenger, 0–100)
- `mode` (text, one of: shadow, ab_test, single)
- `updated_at` (timestamptz, last modification time)

### 3. prediction_logs
Every prediction request served by the API is logged here for drift analysis and audit.
- `id` (uuid, primary key)
- `request_id` (text, unique correlation ID for the request)
- `features` (jsonb, the input feature values)
- `model_version` (int, which model version produced the prediction)
- `prediction` (jsonb, the model output — label, probabilities, etc.)
- `routing_decision` (text, one of: production, challenger, shadow)
- `response_time_ms` (int, prediction latency in milliseconds)
- `created_at` (timestamptz, request timestamp)

### 4. drift_metrics
Per-feature drift scores computed over rolling windows of recent predictions.
- `id` (uuid, primary key)
- `feature_name` (text, name of the feature being evaluated)
- `psi` (double precision, Population Stability Index score)
- `ks_statistic` (double precision, Kolmogorov-Smirnov test statistic)
- `ks_pvalue` (double precision, KS test p-value)
- `severity` (text, one of: stable, warning, critical)
- `sample_size` (int, number of recent predictions used in the calculation)
- `window_start` (timestamptz, start of the rolling window)
- `window_end` (timestamptz, end of the rolling window)
- `created_at` (timestamptz, when this metric was computed)

### 5. retrain_jobs
Tracks retraining pipeline executions, whether triggered manually or by drift.
- `id` (uuid, primary key)
- `status` (text, one of: queued, running, completed, failed)
- `triggered_by` (text, one of: manual, drift, scheduled)
- `trigger_reason` (text, human-readable explanation of why retraining was triggered)
- `new_version` (int, the model version produced, nullable until completion)
- `drift_features` (text[], list of features that triggered the retrain, if applicable)
- `error_message` (text, failure details if status = failed, nullable)
- `started_at` (timestamptz, when the job began processing, nullable)
- `completed_at` (timestamptz, when the job finished, nullable)
- `created_at` (timestamptz, when the job was created)

## Security
- RLS enabled on all tables.
- All tables use `TO anon, authenticated` policies (full CRUD) because this is a
  no-auth operations dashboard — the API and frontend share all data intentionally.
- No user_id columns or auth.uid() checks — single-tenant shared data model.

## Indexes
- prediction_logs: index on created_at (time-series drift queries), model_version
- drift_metrics: index on created_at + feature_name (dashboard time-series queries)
- model_versions: index on stage (filtering by production/staging/archived)
- retrain_jobs: index on status (filtering active jobs)

## Notes
1. routing_config is a singleton (id = 1). A default row is inserted with the
   initial production model version set to 1, mode = 'single', and no challenger.
2. All jsonb columns use jsonb (not json) for efficient indexing and querying.
3. Timestamps use timestamptz for correct timezone handling.
*/

-- ============================================================
-- 1. model_versions
-- ============================================================
CREATE TABLE IF NOT EXISTS model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version int UNIQUE NOT NULL,
  mlflow_run_id text NOT NULL,
  stage text NOT NULL DEFAULT 'staging'
    CHECK (stage IN ('production', 'staging', 'archived', 'challenger')),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_path text NOT NULL DEFAULT '',
  feature_names text[] NOT NULL DEFAULT '{}',
  trained_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_model_versions" ON model_versions;
CREATE POLICY "anon_select_model_versions" ON model_versions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_model_versions" ON model_versions;
CREATE POLICY "anon_insert_model_versions" ON model_versions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_model_versions" ON model_versions;
CREATE POLICY "anon_update_model_versions" ON model_versions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_model_versions" ON model_versions;
CREATE POLICY "anon_delete_model_versions" ON model_versions FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_model_versions_stage ON model_versions (stage);
CREATE INDEX IF NOT EXISTS idx_model_versions_version ON model_versions (version);

-- ============================================================
-- 2. routing_config (singleton — id always = 1)
-- ============================================================
CREATE TABLE IF NOT EXISTS routing_config (
  id int PRIMARY KEY DEFAULT 1,
  production_version int NOT NULL DEFAULT 1,
  challenger_version int,
  traffic_split_pct int NOT NULL DEFAULT 0
    CHECK (traffic_split_pct >= 0 AND traffic_split_pct <= 100),
  mode text NOT NULL DEFAULT 'single'
    CHECK (mode IN ('shadow', 'ab_test', 'single')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE routing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_routing_config" ON routing_config;
CREATE POLICY "anon_select_routing_config" ON routing_config FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_routing_config" ON routing_config;
CREATE POLICY "anon_insert_routing_config" ON routing_config FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_routing_config" ON routing_config;
CREATE POLICY "anon_update_routing_config" ON routing_config FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_routing_config" ON routing_config;
CREATE POLICY "anon_delete_routing_config" ON routing_config FOR DELETE
  TO anon, authenticated USING (true);

-- Insert the singleton default row if it doesn't exist
INSERT INTO routing_config (id, production_version, mode, traffic_split_pct)
SELECT 1, 1, 'single', 0
WHERE NOT EXISTS (SELECT 1 FROM routing_config WHERE id = 1);

-- ============================================================
-- 3. prediction_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS prediction_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text UNIQUE NOT NULL,
  features jsonb NOT NULL,
  model_version int NOT NULL,
  prediction jsonb NOT NULL,
  routing_decision text NOT NULL DEFAULT 'production'
    CHECK (routing_decision IN ('production', 'challenger', 'shadow')),
  response_time_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prediction_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_prediction_logs" ON prediction_logs;
CREATE POLICY "anon_select_prediction_logs" ON prediction_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_prediction_logs" ON prediction_logs;
CREATE POLICY "anon_insert_prediction_logs" ON prediction_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_prediction_logs" ON prediction_logs;
CREATE POLICY "anon_update_prediction_logs" ON prediction_logs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_prediction_logs" ON prediction_logs;
CREATE POLICY "anon_delete_prediction_logs" ON prediction_logs FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_prediction_logs_created_at ON prediction_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_logs_model_version ON prediction_logs (model_version);

-- ============================================================
-- 4. drift_metrics
-- ============================================================
CREATE TABLE IF NOT EXISTS drift_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name text NOT NULL,
  psi double precision NOT NULL,
  ks_statistic double precision NOT NULL,
  ks_pvalue double precision NOT NULL,
  severity text NOT NULL DEFAULT 'stable'
    CHECK (severity IN ('stable', 'warning', 'critical')),
  sample_size int NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE drift_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_drift_metrics" ON drift_metrics;
CREATE POLICY "anon_select_drift_metrics" ON drift_metrics FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_drift_metrics" ON drift_metrics;
CREATE POLICY "anon_insert_drift_metrics" ON drift_metrics FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_drift_metrics" ON drift_metrics;
CREATE POLICY "anon_update_drift_metrics" ON drift_metrics FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_drift_metrics" ON drift_metrics;
CREATE POLICY "anon_delete_drift_metrics" ON drift_metrics FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_drift_metrics_created_at ON drift_metrics (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drift_metrics_feature ON drift_metrics (feature_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drift_metrics_severity ON drift_metrics (severity);

-- ============================================================
-- 5. retrain_jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS retrain_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  triggered_by text NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual', 'drift', 'scheduled')),
  trigger_reason text NOT NULL DEFAULT '',
  new_version int,
  drift_features text[] NOT NULL DEFAULT '{}',
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE retrain_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_retrain_jobs" ON retrain_jobs;
CREATE POLICY "anon_select_retrain_jobs" ON retrain_jobs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_retrain_jobs" ON retrain_jobs;
CREATE POLICY "anon_insert_retrain_jobs" ON retrain_jobs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_retrain_jobs" ON retrain_jobs;
CREATE POLICY "anon_update_retrain_jobs" ON retrain_jobs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_retrain_jobs" ON retrain_jobs;
CREATE POLICY "anon_delete_retrain_jobs" ON retrain_jobs FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_retrain_jobs_status ON retrain_jobs (status);
CREATE INDEX IF NOT EXISTS idx_retrain_jobs_created_at ON retrain_jobs (created_at DESC);
