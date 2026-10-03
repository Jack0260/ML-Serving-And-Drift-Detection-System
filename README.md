# ML Ops Center — Train-to-Serve ML Platform

A complete machine learning operations platform with training, serving, drift detection,
model versioning, shadow/A-B routing, and a real-time monitoring dashboard.

## Architecture

- **Frontend**: React + TypeScript dashboard (Tailwind CSS, dark theme)
- **Backend**: FastAPI (Python) with Pydantic input validation
- **Tracking**: MLflow for experiment tracking and model registry
- **Database**: Supabase (PostgreSQL) for predictions, drift metrics, model versions
- **Load Testing**: Locust scripts with drift injection capability

## Key Features

### Drift Detection
- Population Stability Index (PSI) per feature with configurable thresholds
- Kolmogorov-Smirnov (KS) test for distribution comparison
- Severity classification: stable (< 0.1), warning (0.1-0.25), critical (> 0.25)
- Rolling window analysis over recent predictions
- Automatic retraining recommendation when critical drift is detected

### Model Versioning
- Every training run logged to MLflow with metrics, params, and artifacts
- Model versions tracked in database with lifecycle stages
- Promote/archive versions from the dashboard

### Shadow / A-B Routing
- **Single mode**: All traffic to production model
- **Shadow mode**: Challenger runs silently, predictions logged but not returned
- **A/B test mode**: Configurable traffic split between production and challenger
- Routing decisions logged per request for analysis

### Input Validation
- Pydantic models enforce type checking and range constraints on all features
- Rejects invalid inputs before they reach the model

## Running with Docker

```bash
docker-compose up --build
```

Services:
- Dashboard: http://localhost:3000
- API: http://localhost:8000
- API docs: http://localhost:8000/docs
- MLflow: http://localhost:5001

## Running the Backend Locally

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Training a New Model

```bash
cd backend
python train.py  # default params
python train.py 300 12 0.03  # custom: n_estimators, max_depth, learning_rate
```

## Load Testing

```bash
cd backend
pip install locust
locust -f locustfile.py --host http://localhost:8000
# With drift injection:
locust -f locustfile.py --host http://localhost:8000 --inject-drift true
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/predict` | Get a prediction with input validation |
| GET | `/drift` | Compute and return current drift report |
| GET | `/drift/history` | Historical drift metrics (time-series) |
| GET | `/models` | List all model versions |
| POST | `/models/{version}/promote` | Promote a version to production |
| GET | `/routing` | Get current routing configuration |
| POST | `/routing` | Update routing mode and traffic split |
| POST | `/retrain` | Trigger a retraining job |
| GET | `/retrain/jobs` | List retraining jobs |
| GET | `/predictions` | List recent prediction logs |
| GET | `/health` | Health check |
