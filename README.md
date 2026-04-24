<p align="center">
  <img src="https://img.shields.io/badge/YOLOv5-Crowd_Detection-blue?style=for-the-badge&logo=pytorch&logoColor=white" alt="YOLOv5 Crowd Detection"/>
  <img src="https://img.shields.io/badge/React_18-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 18"/>
  <img src="https://img.shields.io/badge/Express_5-API_Server-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express 5"/>
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB Atlas"/>
</p>

<h1 align="center">🎯 CrowdScope — Intelligent Crowd Analysis Platform</h1>

<p align="center">
  <b>Real-time crowd density monitoring, surge detection, and predictive analytics — powered by a custom YOLOv5 architecture with MultiSEAM attention heads.</b>
</p>

<p align="center">
  <a href="#-live-demo">Live Demo</a> •
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-how-it-works">How It Works</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-api-reference">API Reference</a> •
  <a href="#-deployment">Deployment</a>
</p>

---

## 🌐 Live Demo

| Layer | Platform | URL |
|-------|----------|-----|
| **Frontend** | Vercel | [`crowd-analysis.vercel.app`](https://crowd-analysis.vercel.app) |
| **Backend + ML** | Hugging Face Spaces | [`bytemaster000-crowd-analysis.hf.space`](https://bytemaster000-crowd-analysis.hf.space) |

> **Default credentials for testing:** check `.env.example` for the admin seed account.

---

## ✨ Features

### 🧠 Core ML Pipeline
- **Custom YOLO-CROWD model** — Modified YOLOv5 architecture with C3RFEM backbone blocks and MultiSEAM (Squeeze-and-Excitation Attention Module) detection heads, optimized for dense crowd scenes
- **Dynamic color-coded density mapping** — Adaptive thresholds that auto-scale with a running maximum (GREEN < 30%, YELLOW < 60%, RED ≥ 60%)
- **1-frame lag stabilization** — Color coding uses the previous frame's count against the current maximum to reduce visual flickering
- **Predictive forecasting** — Linear regression on sliding windows to forecast future crowd counts with configurable future steps

### 🖥️ Web Dashboard
- **Live monitoring** — Real-time video stream with annotated bounding boxes, live people count, and dynamic threshold bar
- **Interactive charts** — Time-series area charts with threshold reference lines (Recharts)
- **Alert system** — Automatic surge detection with priority-based alerts (LOW / MEDIUM / HIGH) and captured alert frames
- **Job management** — Upload videos, configure detection parameters, track processing jobs, terminate running analyses
- **Results & analytics** — Per-job statistics, prediction graphs (actual vs. predicted), exportable CSV data and prediction charts
- **Zone designer** — Canvas-based polygon drawing tool over video preview to define restricted monitoring zones

### 🔐 Auth & Multi-Tenancy
- **JWT authentication** with refresh tokens
- **Role-based access** — Admin, Analyst, Viewer roles
- **OAuth ready** — Google and GitHub passport strategies pre-configured
- **Per-user job isolation** — Each user only sees and manages their own detection jobs

### ⚙️ Platform
- **Dark/Light/System theme** support
- **Configurable preferences** — Detection display mode (average vs. total), time range filtering, default parameters
- **Docker-ready** — Single Dockerfile runs both the Node.js API server and Python ML inference
- **File intelligence** — Automatic video format detection via magic byte inspection for extensionless uploads

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CROWDSCOPE PLATFORM                            │
├──────────────────────────────┬──────────────────────────────────────────┤
│       FRONTEND (Vercel)      │       BACKEND (Hugging Face Spaces)     │
│                              │                                         │
│  React 18 + Vite + TailwindCSS│  Express 5 + Node.js 20               │
│  ┌────────────────────────┐  │  ┌───────────────────────────────────┐  │
│  │ Pages                  │  │  │ API Routes                        │  │
│  │  ├─ Dashboard          │  │  │  ├─ /api/auth/*                   │  │
│  │  ├─ Upload & Configure │──┼──│  ├─ /api/detection/start          │  │
│  │  ├─ Live Monitoring    │──┼──│  ├─ /api/detection/jobs/:id/live  │  │
│  │  ├─ Results & Predict  │──┼──│  ├─ /api/detection/jobs/:id/stream│  │
│  │  └─ Settings           │  │  │  ├─ /api/dashboard/stats          │  │
│  └────────────────────────┘  │  │  └─ /api/user/*                   │  │
│  ┌────────────────────────┐  │  └───────────────┬───────────────────┘  │
│  │ UI Components          │  │                  │                      │
│  │  shadcn/ui + Radix UI  │  │  ┌───────────────▼───────────────────┐  │
│  │  Recharts              │  │  │ Job Runner (child_process.spawn)  │  │
│  │  Framer Motion         │  │  │  ├─ Python: optimized_crowd_      │  │
│  │  Lucide React Icons    │  │  │  │          detection.py          │  │
│  └────────────────────────┘  │  │  ├─ [DATA] JSON lines → buffer   │  │
│                              │  │  └─ Python: crowd_prediction.py   │  │
│                              │  └───────────────┬───────────────────┘  │
│                              │                  │                      │
│                              │  ┌───────────────▼───────────────────┐  │
│                              │  │ MongoDB Atlas                     │  │
│                              │  │  ├─ Users (auth, roles, prefs)    │  │
│                              │  │  ├─ Jobs (status, config, stats)  │  │
│                              │  │  ├─ Alerts (level, frame, zone)   │  │
│                              │  │  └─ Sessions & Results            │  │
│                              │  └───────────────────────────────────┘  │
└──────────────────────────────┴──────────────────────────────────────────┘
```

---

## ⚡ How It Works

### 1. Video Ingestion
The user uploads a video file (MP4, AVI, MOV, MKV, etc.) or provides a live stream URL (RTSP / HTTP). The backend stores the file, creates a job document in MongoDB, and spawns a Python child process.

### 2. YOLO-CROWD Inference
```
Input Frame → Resize (640px) → YOLOv5 Backbone (Focus + C3 + SPP + C3RFEM)
            → FPN Neck → MultiSEAM Attention Heads (P3/P4/P5) → NMS → Detections
```

The custom `yolo_crowd.yaml` architecture extends standard YOLOv5 with:
- **C3RFEM** (Receptive Field Enhancement Module) in the backbone for better multi-scale feature extraction
- **MultiSEAM** attention on each detection head to suppress background noise in dense scenes
- **RetinaFace-style anchors** tuned for human body proportions

### 3. Dynamic Color Coding
Instead of static thresholds, the system maintains a **running maximum** crowd count that auto-scales:

| Density Level | Range | Color |
|:---|:---|:---|
| 🟢 LOW | 0 – 30% of current max | Green |
| 🟡 MODERATE | 30 – 60% of current max | Yellow |
| 🔴 HIGH | 60 – 100% of current max | Red |

A **1-frame lag** mechanism uses the *previous* frame's count against the *current* maximum — preventing sudden color jumps from single-frame spikes.

### 4. Real-Time Data Pipeline
The Python process emits structured JSON on stdout for every processed frame:
```json
{"f":142,"t":5.680,"c":23,"l":"yellow","d":"MODERATE","m":45,"t30":13,"t60":27}
```
The Node.js job runner:
- Parses `[DATA]` lines from the Python process stdout
- Maintains an **in-memory ring buffer** (last 50 data points) per job
- Serves live data via `/api/detection/jobs/:id/live-data` (no disk I/O for the live dashboard)
- Saves processed frames to disk for `/api/detection/jobs/:id/stream` (JPEG, refreshed every second)

### 5. Prediction & Forecasting
After detection completes, users can run the prediction module:
1. Loads the CSV of frame-level crowd counts
2. Builds a sliding-window feature matrix (`X`) with adaptive window sizing
3. Trains an in-sample Linear Regression model
4. Forecasts N future frames by iteratively sliding the prediction window
5. Returns MAE/RMSE metrics, prediction CSV, and a matplotlib chart

### 6. Alert Generation
The dashboard route aggregates completed jobs and generates alerts when:
- A job's **peak crowd count** exceeds the configured **base maximum** threshold
- Priority is assigned based on the ratio: `peakCount / baseMax`
  - `> 150%` → 🔴 HIGH
  - `> 100%` → 🟡 MEDIUM
  - Otherwise → 🔵 LOW
- Alert frames (screenshots) are auto-captured during HIGH density moments

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20.x |
| Python | ≥ 3.10 |
| MongoDB | Atlas (cloud) or local |
| Git LFS | For model weights |

### Clone & Setup

```bash
# Clone the repository
git clone https://github.com/parvsshah/CCTV_Model.git
cd CCTV_Model

# Download model weights (if not using Git LFS)
# The yolo-crowd.pt file (~35MB) is the primary model
wget -L https://github.com/parvsshah/CCTV_Model/releases/download/v1.0.0/yolo-crowd.pt
```

### Backend (Python ML Engine)

```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt
```

### Frontend + API Server

```bash
cd frontend

# Install Node.js dependencies
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, etc.
```

### Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```env
NODE_ENV=production
PORT=8080

# MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.db.mongodb.net/crowd_analysis

# JWT secret for authentication
JWT_SECRET=your-secure-random-secret

# Default admin account (created on first startup)
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=strongpassword123

# Python binary path (usually auto-detected)
PYTHON_BIN=python3
```

### Run Locally

```bash
# From the frontend directory
npm run dev    # Starts Vite dev server on :5173

# In a separate terminal — build & start the API server
npm run build:server
npm start      # Starts Express on :8080
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Standalone ML Detection (No Web UI)

```bash
# Run detection directly on a video file
python optimized_crowd_detection.py \
  --weights yolo-crowd.pt \
  --source path/to/video.mp4 \
  --conf-thres 0.25 \
  --frame-skip 2 \
  --base-max 100 \
  --view-img

# Run prediction on detection results
python crowd_prediction.py \
  --csv runs/detect/tracking/<timestamp>.csv \
  --future 50 \
  --show-plot
```

---

## 📡 API Reference

All authenticated endpoints require the `Authorization: Bearer <token>` header.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login, returns JWT |
| `POST` | `/api/auth/logout` | Invalidate session |
| `GET` | `/api/auth/me` | Get current user profile |

### Detection Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/detection/start` | Start detection (multipart: `file` + config) |
| `GET` | `/api/detection/jobs` | List all user's jobs |
| `GET` | `/api/detection/jobs/:id` | Get job details & artifacts |
| `GET` | `/api/detection/jobs/:id/live-data` | Real-time data from in-memory buffer |
| `GET` | `/api/detection/jobs/:id/stream` | Latest processed frame (JPEG) |
| `POST` | `/api/detection/jobs/:id/predict` | Run prediction model |
| `POST` | `/api/detection/jobs/:id/terminate` | Stop a running job |

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/dashboard/stats` | Aggregated stats, charts, alerts |
| `GET` | `/api/dashboard/processing-jobs` | Currently active jobs |

### Detection Config Schema

```json
{
  "sourceType": "upload | stream",
  "file": "<multipart video file>",
  "streamUrl": "rtsp://... or https://...",
  "frameSkip": 1,
  "confidence": 70,
  "baseMax": 100,
  "maxFrames": 0
}
```

---

## 🐳 Deployment

### Docker (Hugging Face Spaces)

The project includes a production `Dockerfile` that bundles both the Node.js API server and Python ML engine:

```bash
docker build -t crowdscope .
docker run -p 7860:7860 \
  -e MONGODB_URI="your_mongodb_uri" \
  -e JWT_SECRET="your_secret" \
  crowdscope
```

The Docker image:
- Uses `nikolaik/python-nodejs:python3.10-nodejs20-slim` as base
- Installs OpenCV system dependencies (`libgl1`, `libglib2.0`)
- Downloads model weights from GitHub Releases
- Builds the Express API server via Vite
- Exposes port `7860` (Hugging Face Spaces default)

### Frontend (Vercel)

The React frontend deploys to Vercel as a static SPA with a `VITE_API_URL` env variable pointing to the Hugging Face backend.

```bash
# vercel.json handles SPA routing
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 📁 Project Structure

```
YOLO-CROWD/
├── optimized_crowd_detection.py   # Core YOLO detection engine (651 lines)
├── crowd_prediction.py            # ML prediction & forecasting module
├── crowd_regressor.joblib          # Pre-trained regression model
├── yolo-crowd.pt                  # Custom YOLO-CROWD model weights (~35MB)
├── requirements.txt               # Python dependencies
├── Dockerfile                     # Production Docker build
├── Dockerfile.hf                  # Hugging Face Spaces variant
│
├── models/
│   ├── yolo_crowd.yaml            # Custom YOLO architecture definition
│   ├── common.py                  # Core model building blocks (C3RFEM, MultiSEAM)
│   ├── yolo.py                    # YOLO model class
│   └── experimental.py            # Model loading utilities
│
├── utils/
│   ├── datasets.py                # Video/image data loaders (LoadStreams, LoadImages)
│   ├── general.py                 # NMS, coordinate transforms, utilities
│   ├── plots.py                   # Bounding box drawing, annotations
│   ├── torch_utils.py             # Device selection, timing utilities
│   └── metrics.py                 # mAP, precision/recall metrics
│
└── frontend/
    ├── client/                    # React SPA
    │   ├── pages/
    │   │   ├── Dashboard.tsx      # Main overview with stats, charts, alerts
    │   │   ├── Upload.tsx         # Video upload + zone designer + config
    │   │   ├── Live.tsx           # Real-time monitoring with stream viewer
    │   │   ├── Results.tsx        # Analytics, prediction, export
    │   │   ├── Settings.tsx       # Preferences, profile, theme
    │   │   ├── Login.tsx          # Authentication
    │   │   └── Register.tsx       # New user registration
    │   ├── components/            # Reusable UI components (shadcn/ui)
    │   ├── context/               # Auth context provider
    │   └── lib/                   # API client, auth helpers
    │
    ├── server/                    # Express API server
    │   ├── routes/                # Auth, detection, dashboard, user routes
    │   ├── jobs/                  # Detection job runner (Python process mgmt)
    │   ├── db/                    # MongoDB connection + Mongoose models
    │   │   └── models/            # User, Job, Alert, Result, Session schemas
    │   ├── middleware/            # JWT auth middleware
    │   └── utils/                # File utilities
    │
    └── shared/                    # Shared TypeScript types (client ↔ server)
        └── api.ts                 # Request/response interfaces
```

---

## 🧪 CLI Reference

### `optimized_crowd_detection.py`

| Flag | Default | Description |
|------|---------|-------------|
| `--weights` | `yolo-crowd.pt` | Path to model weights |
| `--source` | `data/images` | Video file, folder, `0` for webcam, or URL |
| `--output` | `runs/detect` | Output directory for results |
| `--img-size` | `640` | Inference resolution (pixels) |
| `--conf-thres` | `0.25` | Confidence threshold (0–1) |
| `--iou-thres` | `0.45` | NMS IoU threshold |
| `--device` | Auto | `cpu` or `0` for GPU |
| `--frame-skip` | `1` | Process every Nth frame |
| `--max-frames` | `0` | Max frames to process (0 = all) |
| `--base-max` | `15` | Initial maximum for color scaling |
| `--view-img` | Off | Show live detection window |
| `--stream-frames` | Off | Save frames for web streaming |

### `crowd_prediction.py`

| Flag | Default | Description |
|------|---------|-------------|
| `--csv` | `runs/detect/crowd_tracking.csv` | Input tracking CSV |
| `--future` | `10` | Number of future frames to forecast |
| `--out` | `runs/detect/crowd_predictions_with_future.csv` | Output path |
| `--show-plot` | Off | Display matplotlib chart interactively |
| `--force-full-window` | Off | Use `rows-1` as window size |

---

## 🛠️ Tech Stack

| Layer | Technologies |
|-------|-------------|
| **ML / CV** | PyTorch, YOLOv5 (custom), OpenCV, NumPy, scikit-learn, matplotlib |
| **Backend** | Node.js 20, Express 5, Mongoose 9, JWT, Passport.js, Multer |
| **Frontend** | React 18, Vite 7, TypeScript, TailwindCSS, shadcn/ui, Radix UI, Recharts, Framer Motion |
| **Database** | MongoDB Atlas |
| **Infra** | Docker, Hugging Face Spaces, Vercel, GitHub Releases (model hosting) |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is for educational and research purposes. The YOLO-CROWD model architecture is based on the YOLOv5 framework by Ultralytics.

---

<p align="center">
  Built with 💙 by <a href="https://github.com/parvsshah">Parv Shah</a>
</p>
