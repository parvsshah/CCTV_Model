/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

export interface UserSummary {
  id: string;
  name: string;
  username: string;
  email: string;
  role: "admin" | "analyst" | "viewer";
  avatarUrl?: string;
}

export interface AuthRegisterRequest {
  name: string;
  username: string;
  email: string;
  password?: string;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthLoginResponse {
  token: string;
  refreshToken?: string;
  user: UserSummary;
}

export interface AuthMeResponse {
  user: UserSummary;
}

export interface DetectionJob {
  id: string;
  name: string;
  status: "queued" | "processing" | "completed" | "failed";
  maxPeople: number;
  durationSeconds: number;
  startedAt: string;
  completedAt?: string;
  videoUrl?: string; // URL to processed video
}

export interface AlertSummary {
  id: string;
  level: "low" | "medium" | "high";
  message: string;
  peopleCount: number;
  triggeredAt: string;
  zone?: string;
}

export interface DashboardStatsResponse {
  totals: {
    detectionsToday: number;        // Total sum (for backward compatibility)
    averageCrowdCount: number;      // Normalized average count
    activeAlerts: number;
    processingJobs: number;
    avgDensity: number;
    timeRangeLabel?: string;        // e.g., "Last 2 hours"
  };
  jobs: DetectionJob[];
  alerts: AlertSummary[];
  chart: Array<{ time: string; value: number }>;
}

export type DetectionSourceType = "upload" | "stream" | "camera" | "file";

export type DetectionJobStatus = "queued" | "running" | "completed" | "failed";

export interface DetectionConfig {
  frameSkip: number;
  confidence: number;
  baseMax: number;
  maxFrames: number;
}

export interface DetectionStartRequest {
  sourceType: DetectionSourceType;
  streamUrl?: string;
  config: DetectionConfig;
  notes?: string;
}

export interface DetectionJobSummary {
  id: string;
  status: DetectionJobStatus;
  sourceType: DetectionSourceType;
  sourceName: string;
  createdAt: string;
  updatedAt: string;
  config: DetectionConfig;
  artifacts?: {
    video?: string;
    csv?: string;
    alerts?: string[];
  };
  stats?: DetectionJobStats;
  prediction?: DetectionPredictionSummary;
  error?: string;
}

export interface DetectionJobStats {
  totalDetections: number;
  maxPeople: number;
  averagePeople: number;
  currentMax: number;
}

export interface DetectionStartResponse {
  job: DetectionJobSummary;
}

export interface DetectionJobListResponse {
  jobs: DetectionJobSummary[];
}

export interface PredictionPoint {
  frameId: number;
  timestamp?: number | null;
  actualCount: number | null;
  predictedCount: number;
}

export interface DetectionPredictionStats {
  mae: number;
  rmse: number;
  historicalPoints: number;
  futureSteps: number;
}

export interface DetectionPredictionSummary {
  generatedAt: string;
  futureSteps: number;
  csv?: string;
  plot?: string;
}

export interface DetectionPredictionResponse {
  jobId: string;
  predictions: PredictionPoint[];
  stats: DetectionPredictionStats;
  artifacts: {
    csv?: string;
    plot?: string;
  };
}

// Detection view preferences
export type DetectionViewMode = "average" | "total";
export type TimeRange = "30min" | "1hour" | "2hours" | "3hours" | "5hours";

export interface UserPreferences {
  detectionViewMode: DetectionViewMode;
  timeRange: TimeRange;
}

// Dashboard stats request with time filtering
export interface DashboardStatsRequest {
  timeRange?: TimeRange;
}
