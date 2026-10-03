"""
Training script: trains a Gradient Boosting classifier on the breast cancer dataset,
logs to MLflow, saves model artifact + reference distribution, and registers the model.
"""

import json
import os
import sys
import numpy as np
import pandas as pd
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
import mlflow
import mlflow.sklearn
from supabase import create_client, Client

FEATURE_NAMES = [
    "mean_radius", "mean_texture", "mean_perimeter", "mean_area",
    "mean_smoothness", "mean_compactness", "mean_concavity",
    "mean_concave_points", "mean_symmetry", "mean_fractal_dimension",
]

DRIFT_WINDOW_SIZE = 100


def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL", os.environ.get("VITE_SUPABASE_URL", ""))
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("VITE_SUPABASE_ANON_KEY", ""))
    return create_client(url, key)


def train(n_estimators: int = 200, max_depth: int = 10, learning_rate: float = 0.05):
    """Train a model, log to MLflow, save reference distribution, register version."""

    mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "http://localhost:5001"))
    mlflow.set_experiment("breast-cancer-classifier")

    data = load_breast_cancer()
    X = pd.DataFrame(data.data, columns=FEATURE_NAMES)
    y = data.target

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    params = {"n_estimators": n_estimators, "max_depth": max_depth, "learning_rate": learning_rate}

    with mlflow.start_run() as run:
        mlflow.log_params(params)

        model = GradientBoostingClassifier(**params, random_state=42)
        model.fit(X_train, y_train)

        y_pred = model.predict(X_test)
        y_proba = model.predict_proba(X_test)[:, 1]

        metrics = {
            "accuracy": float(accuracy_score(y_test, y_pred)),
            "f1": float(f1_score(y_test, y_pred)),
            "precision": float(precision_score(y_test, y_pred)),
            "recall": float(recall_score(y_test, y_pred)),
            "auc": float(roc_auc_score(y_test, y_proba)),
        }
        mlflow.log_metrics(metrics)

        mlflow.sklearn.log_model(model, "model")

        # Save reference distribution for drift detection
        reference = {}
        for col in FEATURE_NAMES:
            reference[col] = {
                "mean": float(X_train[col].mean()),
                "std": float(X_train[col].std()),
                "min": float(X_train[col].min()),
                "max": float(X_train[col].max()),
                "quantiles": [float(X_train[col].quantile(q)) for q in [0.1, 0.25, 0.5, 0.75, 0.9]],
            }
        mlflow.log_dict(reference, "reference_distribution.json")

        # Determine next version number
        sb = get_supabase()
        existing = sb.table("model_versions").select("version").order("version", desc=True).limit(1).execute()
        next_version = (existing.data[0]["version"] + 1) if existing.data else 1

        # Register in database
        sb.table("model_versions").insert({
            "version": next_version,
            "mlflow_run_id": run.info.run_id,
            "stage": "staging",
            "metrics": metrics,
            "params": {k: str(v) for k, v in params.items()},
            "artifact_path": f"mlflow-artifacts:/models/v{next_version}",
            "feature_names": FEATURE_NAMES,
            "trained_at": run.info.end_time or run.info.start_time,
        }).execute()

        # Save reference distribution locally for the serving layer
        ref_path = os.path.join(os.path.dirname(__file__), "reference_distribution.json")
        with open(ref_path, "w") as f:
            json.dump({col: X_train[col].values.tolist() for col in FEATURE_NAMES}, f)

        print(f"Training complete. Version {next_version}. Metrics: {json.dumps(metrics, indent=2)}")
        return next_version, metrics


if __name__ == "__main__":
    n_estimators = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    max_depth = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    learning_rate = float(sys.argv[3]) if len(sys.argv) > 3 else 0.05
    train(n_estimators, max_depth, learning_rate)
