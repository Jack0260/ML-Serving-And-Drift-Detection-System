"""
Drift detection using Population Stability Index (PSI) and Kolmogorov-Smirnov test.
"""

import numpy as np
from scipy import stats
from typing import Literal

PSI_WARNING = 0.1
PSI_CRITICAL = 0.25

NUM_BINS = 10
EPSILON = 1e-4


def calculate_psi(expected: np.ndarray, actual: np.ndarray, bins: int = NUM_BINS) -> float:
    """
    Population Stability Index: measures how much a distribution has shifted
    between a reference (training) and a current (live) sample.

    PSI < 0.1  → stable
    PSI 0.1-0.25 → warning (significant shift)
    PSI > 0.25 → critical (major shift, retraining needed)
    """
    if len(expected) < 2 or len(actual) < 2:
        return 0.0

    breakpoints = np.linspace(min(expected.min(), actual.min()),
                              max(expected.max(), actual.max()), bins + 1)
    breakpoints[0] = -np.inf
    breakpoints[-1] = np.inf

    expected_counts = np.histogram(expected, bins=breakpoints)[0].astype(float)
    actual_counts = np.histogram(actual, bins=breakpoints)[0].astype(float)

    expected_pct = expected_counts / len(expected)
    actual_pct = actual_counts / len(actual)

    expected_pct = np.clip(expected_pct, EPSILON, None)
    actual_pct = np.clip(actual_pct, EPSILON, None)

    psi = np.sum((actual_pct - expected_pct) * np.log(actual_pct / expected_pct))
    return float(psi)


def calculate_ks(expected: np.ndarray, actual: np.ndarray) -> tuple[float, float]:
    """Kolmogorov-Smirnov test. Returns (statistic, p-value)."""
    if len(expected) < 2 or len(actual) < 2:
        return 0.0, 1.0
    result = stats.ks_2samp(expected, actual)
    return float(result.statistic), float(result.pvalue)


def classify_severity(psi: float) -> Literal["stable", "warning", "critical"]:
    if psi >= PSI_CRITICAL:
        return "critical"
    if psi >= PSI_WARNING:
        return "warning"
    return "stable"
