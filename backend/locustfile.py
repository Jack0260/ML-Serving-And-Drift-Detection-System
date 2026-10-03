"""
Locust load test script for the ML Ops /predict endpoint.

Usage:
    pip install locust
    locust -f locustfile.py --host http://localhost:8000

Then open http://localhost:8089 to configure number of users and spawn rate.

Options:
    --inject-drift   Send shifted feature distributions to trigger drift detection
"""

import random
import json
from locust import HttpUser, task, between, events

# Normal distribution ranges (matching training data)
NORMAL_RANGES = {
    "mean_radius": (10, 18),
    "mean_texture": (16, 25),
    "mean_perimeter": (80, 110),
    "mean_area": (400, 750),
    "mean_smoothness": (0.08, 0.12),
    "mean_compactness": (0.07, 0.13),
    "mean_concavity": (0.03, 0.11),
    "mean_concave_points": (0.01, 0.06),
    "mean_symmetry": (0.15, 0.21),
    "mean_fractal_dimension": (0.05, 0.08),
}

# Drifted distribution ranges (shifted to trigger PSI alerts)
DRIFTED_RANGES = {
    "mean_radius": (18, 26),
    "mean_texture": (28, 38),
    "mean_perimeter": (120, 150),
    "mean_area": (900, 1200),
    "mean_smoothness": (0.08, 0.12),
    "mean_compactness": (0.07, 0.13),
    "mean_concavity": (0.03, 0.11),
    "mean_concave_points": (0.01, 0.06),
    "mean_symmetry": (0.15, 0.21),
    "mean_fractal_dimension": (0.05, 0.08),
}

INJECT_DRIFT = False


@events.init_command_line_parser.add_listener
def on_init(parser):
    parser.add_argument("--inject-drift", type=bool, default=False,
                        help="Send drifted feature distributions")


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    global INJECT_DRIFT
    INJECT_DRIFT = environment.parsed_options.inject_drift


def generate_features(drift: bool = False) -> dict:
    ranges = DRIFTED_RANGES if drift else NORMAL_RANGES
    return {k: round(random.uniform(v[0], v[1]), 4) for k, v in ranges.items()}


class MLPredictionUser(HttpUser):
    wait_time = between(0.1, 0.5)

    @task(10)
    def predict_normal(self):
        self.client.post("/predict", json=generate_features(drift=False))

    @task(3)
    def predict_drifted(self):
        drift = INJECT_DRIFT or random.random() < 0.2
        self.client.post("/predict", json=generate_features(drift=drift))

    @task(1)
    def check_drift(self):
        self.client.get("/drift")

    @task(1)
    def check_health(self):
        self.client.get("/health")
