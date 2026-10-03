"""
FastAPI application for ML model serving with drift detection,
shadow/A-B routing, model versioning, and retraining endpoints.
"""

import os
import time
import uuid
import json
import random
from typing import Optional
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client

from models import (
    PredictionRequest, PredictionResponse, DriftReport, DriftFeatureResult,
    RoutingConfigUpdate, RetrainTrigger,
)
from drift import calculate_psi, calculate_ks, classify_severity, PSI_WARNING, PSI_CRITICAL

app = FastAPI(title="ML Ops — Train-to-Serve API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FEATURE_NAMES = [
    "mean_radius", "mean_texture", "mean_perimeter", "mean_area",
    "mean_smoothness", "mean_compactness", "mean_concavity",
    "mean_concave_points", "mean_symmetry", "mean_fractal_dimension",
]

DRIFT_WINDOW_SIZE = 100

sb: Client = create_client(
    os.environ.get("SUPABASE_URL", os.environ.get("VITE_SUPABASE_URL", "")),
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("VITE_SUPABASE_ANON_KEY", "")),
)


def load_reference_distribution() -> dict[str, np.ndarray]:
    ref_path = os.path.join(os.path.dirname(__file__), "reference_distribution.json")
    if os.path.exists(ref_path):
        with open(ref_path) as f:
            raw = json.load(f)
        return {k: np.array(v) for k, v in raw.items()}
    return {col: np.array([]) for col in FEATURE_NAMES}


def get_routing_config() -> dict:
    result = sb.table("routing_config").select("*").eq("id", 1).maybeSingle().execute()
    return result.data or {"production_version": 1, "challenger_version": None,
                           "traffic_split_pct": 0, "mode": "single"}


def determine_routing(config: dict) -> tuple[int, str]:
    """Returns (model_version, routing_decision)."""
    mode = config.get("mode", "single")
    prod_v = config.get("production_version", 1)
    challenger_v = config.get("challenger_version")
    split = config.get("traffic_split_pct", 0)

    if mode == "single" or not challenger_v:
        return prod_v, "production"

    if mode == "shadow":
        # Always return production prediction, but also run challenger silently
        return prod_v, "production"

    if mode == "ab_test":
        if random.randint(1, 100) <= split:
            return challenger_v, "challenger"
        return prod_v, "production"

    return prod_v, "production"


def mock_predict(features: dict, version: int) -> dict:
    """Simulate a model prediction. In production, load the actual sklearn model."""
    score = sum(features.values()) / len(features)
    label = "malignant" if score > 0.15 else "benign"
    probability = min(max(abs(np.tanh(score)) * 0.8 + 0.1 + random.random() * 0.1, 0), 1)
    return {"label": label, "probability": round(probability, 4)}


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "ml-ops-api"}


@app.post("/predict", response_model=PredictionResponse)
async def predict(req: PredictionRequest):
    start = time.time()
    request_id = f"req_{uuid.uuid4().hex[:12]}"
    config = get_routing_config()
    model_version, routing_decision = determine_routing(config)

    features = req.model_dump()
    prediction = mock_predict(features, model_version)

    elapsed_ms = int((time.time() - start) * 1000)

    sb.table("prediction_logs").insert({
        "request_id": request_id,
        "features": features,
        "model_version": model_version,
        "prediction": prediction,
        "routing_decision": routing_decision,
        "response_time_ms": elapsed_ms,
    }).execute()

    # If shadow mode, also log challenger prediction
    if config.get("mode") == "shadow" and config.get("challenger_version"):
        challenger_pred = mock_predict(features, config["challenger_version"])
        sb.table("prediction_logs").insert({
            "request_id": f"shadow_{uuid.uuid4().hex[:12]}",
            "features": features,
            "model_version": config["challenger_version"],
            "prediction": challenger_pred,
            "routing_decision": "shadow",
            "response_time_ms": elapsed_ms,
        }).execute()

    return PredictionResponse(
        request_id=request_id,
        model_version=model_version,
        prediction=prediction["label"],
        probability=prediction["probability"],
        routing_decision=routing_decision,
        response_time_ms=elapsed_ms,
    )


@app.get("/drift", response_model=DriftReport)
async def get_drift():
    reference = load_reference_distribution()
    recent = sb.table("prediction_logs").select("features").order(
        "created_at", desc=True
    ).limit(DRIFT_WINDOW_SIZE).execute()

    if not recent.data or len(recent.data) < 10:
        return DriftReport(
            computed_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            features=[],
            critical_count=0, warning_count=0, stable_count=0,
            retrain_recommended=False,
        )

    live_features = {col: [] for col in FEATURE_NAMES}
    for row in recent.data:
        feats = row.get("features", {})
        for col in FEATURE_NAMES:
            if col in feats:
                live_features[col].append(float(feats[col]))

    results = []
    critical_count = 0
    warning_count = 0
    stable_count = 0

    for col in FEATURE_NAMES:
        ref = reference.get(col, np.array([]))
        live = np.array(live_features[col])

        if len(ref) == 0 or len(live) == 0:
            continue

        psi = calculate_psi(ref, live)
        ks_stat, ks_pvalue = calculate_ks(ref, live)
        severity = classify_severity(psi)

        if severity == "critical":
            critical_count += 1
        elif severity == "warning":
            warning_count += 1
        else:
            stable_count += 1

        result = DriftFeatureResult(
            feature_name=col, psi=psi, ks_statistic=ks_stat,
            ks_pvalue=ks_pvalue, severity=severity, sample_size=len(live),
        )
        results.append(result)

        sb.table("drift_metrics").insert({
            "feature_name": col, "psi": psi, "ks_statistic": ks_stat,
            "ks_pvalue": ks_pvalue, "severity": severity,
            "sample_size": len(live),
            "window_start": recent.data[-1].get("created_at", ""),
            "window_end": recent.data[0].get("created_at", ""),
        }).execute()

    return DriftReport(
        computed_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        features=results,
        critical_count=critical_count,
        warning_count=warning_count,
        stable_count=stable_count,
        retrain_recommended=critical_count > 0,
    )


@app.get("/drift/history")
async def get_drift_history(feature: Optional[str] = None, limit: int = 50):
    query = sb.table("drift_metrics").select("*").order("created_at", desc=True).limit(limit * 10)
    if feature:
        query = query.eq("feature_name", feature)
    result = query.execute()
    return result.data


@app.get("/models")
async def get_models():
    result = sb.table("model_versions").select("*").order("version", desc=True).execute()
    return result.data


@app.post("/models/{version}/promote")
async def promote_model(version: int):
    sb.table("model_versions").update({"stage": "archived"}).eq("stage", "production").execute()
    sb.table("model_versions").update({"stage": "production"}).eq("version", version).execute()
    sb.table("routing_config").update({
        "production_version": version, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }).eq("id", 1).execute()
    return {"status": "promoted", "version": version}


@app.get("/routing")
async def get_routing():
    result = sb.table("routing_config").select("*").eq("id", 1).maybeSingle().execute()
    return result.data


@app.post("/routing")
async def update_routing(config: RoutingConfigUpdate):
    updates = {
        "mode": config.mode,
        "traffic_split_pct": config.traffic_split_pct,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    if config.challenger_version is not None:
        updates["challenger_version"] = config.challenger_version
    if config.mode == "single":
        updates["challenger_version"] = None
        updates["traffic_split_pct"] = 0

    sb.table("routing_config").update(updates).eq("id", 1).execute()
    return {"status": "updated", "config": updates}


@app.post("/retrain")
async def trigger_retrain(trigger: RetrainTrigger):
    result = sb.table("retrain_jobs").insert({
        "status": "queued",
        "triggered_by": trigger.triggered_by,
        "trigger_reason": trigger.trigger_reason or "Manual retraining triggered via API",
        "drift_features": trigger.drift_features,
    }).execute()

    job_id = result.data[0]["id"] if result.data else None
    return {"status": "queued", "job_id": job_id}


@app.get("/retrain/jobs")
async def get_retrain_jobs(limit: int = 20):
    result = sb.table("retrain_jobs").select("*").order("created_at", desc=True).limit(limit).execute()
    return result.data


@app.get("/predictions")
async def get_predictions(limit: int = 50):
    result = sb.table("prediction_logs").select("*").order("created_at", desc=True).limit(limit).execute()
    return result.data
