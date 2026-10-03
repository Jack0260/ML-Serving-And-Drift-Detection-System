"""
Pydantic models for input validation on the /predict endpoint.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional


class PredictionRequest(BaseModel):
    """Input features for a prediction request. All features are required."""

    mean_radius: float = Field(..., ge=0, le=100, description="Mean radius of the nucleus (0-100)")
    mean_texture: float = Field(..., ge=0, le=100, description="Standard deviation of gray-scale values (0-100)")
    mean_perimeter: float = Field(..., ge=0, le=300, description="Mean perimeter (0-300)")
    mean_area: float = Field(..., ge=0, le=3000, description="Mean area (0-3000)")
    mean_smoothness: float = Field(..., ge=0, le=1, description="Mean smoothness (0-1)")
    mean_compactness: float = Field(..., ge=0, le=1, description="Mean compactness (0-1)")
    mean_concavity: float = Field(..., ge=0, le=1, description="Mean concavity (0-1)")
    mean_concave_points: float = Field(..., ge=0, le=1, description="Mean concave points (0-1)")
    mean_symmetry: float = Field(..., ge=0, le=1, description="Mean symmetry (0-1)")
    mean_fractal_dimension: float = Field(..., ge=0, le=1, description="Mean fractal dimension (0-1)")

    @field_validator("mean_radius", "mean_texture", "mean_perimeter", "mean_area")
    @classmethod
    def check_not_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Value must be non-negative")
        return v


class PredictionResponse(BaseModel):
    """Prediction output returned to the caller."""

    request_id: str
    model_version: int
    prediction: str
    probability: float
    routing_decision: str
    response_time_ms: int


class DriftFeatureResult(BaseModel):
    feature_name: str
    psi: float
    ks_statistic: float
    ks_pvalue: float
    severity: str
    sample_size: int


class DriftReport(BaseModel):
    computed_at: str
    features: list[DriftFeatureResult]
    critical_count: int
    warning_count: int
    stable_count: int
    retrain_recommended: bool


class RoutingConfigUpdate(BaseModel):
    mode: str = Field(..., pattern="^(single|shadow|ab_test)$")
    challenger_version: Optional[int] = None
    traffic_split_pct: int = Field(0, ge=0, le=100)


class RetrainTrigger(BaseModel):
    triggered_by: str = Field("manual", pattern="^(manual|drift|scheduled)$")
    trigger_reason: str = ""
    drift_features: list[str] = []
