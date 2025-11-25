# YOLO-CROWD Frontend + Backend Integration Setup

## Project Structure
- **Frontend**: React + TypeScript + Vite (in `frontend/` directory)
- **Backend**: Express.js API server (integrated with Vite dev server)
- **Python Scripts**: Detection and prediction scripts (in parent `YOLO-CROWD/` directory)

## Quick Start

### 1. Install Dependencies
```bash
cd frontend
pnpm install
```

### 2. Start Development Server
```bash
pnpm dev
```

The server will start on **http://localhost:8080**

- **Frontend SPA**: http://localhost:8080/
- **API Endpoints**: http://localhost:8080/api/*
- **Static Files**: http://localhost:8080/runs/*

## Configuration

### Environment Variables
Create a `.env` file in the `frontend/` directory (optional):
```
PYTHON_BIN=python3
DETECTION_UPLOAD_DIR=./uploads
PORT=8080
```

### Python Scripts Location
The backend expects Python scripts in the parent directory:
- `../optimized_crowd_detection.py`
- `../crowd_prediction.py`

The `runs/` directory is also expected in the parent directory.

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

### Detection Jobs
- `POST /api/detection/start` - Start a new detection job
- `GET /api/detection/jobs` - List all jobs
- `GET /api/detection/jobs/:id` - Get job details
- `POST /api/detection/jobs/:id/predict` - Run prediction for a job

## Troubleshooting

### Server Not Starting
1. Check if port 8080 is available: `lsof -i :8080`
2. Check for TypeScript errors: `pnpm typecheck`
3. Verify Python scripts exist in parent directory

### Frontend Not Loading
1. Check browser console for errors
2. Verify Vite dev server is running
3. Check that `index.html` exists and references `/client/App.tsx`

### API Routes Not Working
1. Verify Express middleware is properly integrated in `vite.config.ts`
2. Check server logs for errors
3. Test API directly: `curl http://localhost:8080/api/ping`

## File Paths

The integration uses these path resolutions:
- **Frontend root**: `frontend/`
- **Project root** (Python scripts): `YOLO-CROWD/` (parent of frontend)
- **Runs directory**: `YOLO-CROWD/runs/`
- **Uploads directory**: `frontend/uploads/`


