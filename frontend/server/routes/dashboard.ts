import { Router } from "express";
import { DashboardStatsResponse, DetectionJob, AlertSummary, TimeRange } from "@shared/api";
import { listDetectionJobs } from "../jobs/detection-jobs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { isDBConnected } from "../db/connection.js";
import AlertModel from "../db/models/Alert.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..", "..");
// Runs directory is in the parent directory (YOLO-CROWD root)
const projectRoot = path.resolve(frontendRoot, "..");
const runsDir = path.resolve(projectRoot, "runs");
const trackingDir = path.resolve(runsDir, "crowd_tracking");

const router = Router();

// Time range utilities
function getTimeRangeInMinutes(range: TimeRange): number {
  const ranges: Record<TimeRange, number> = {
    "30min": 30,
    "1hour": 60,
    "2hours": 120,
    "3hours": 180,
    "5hours": 300,
  };
  return ranges[range];
}

function getTimeRangeLabel(range: TimeRange): string {
  const labels: Record<TimeRange, string> = {
    "30min": "Last 30 minutes",
    "1hour": "Last 1 hour",
    "2hours": "Last 2 hours",
    "3hours": "Last 3 hours",
    "5hours": "Last 5 hours",
  };
  return labels[range];
}

function filterJobsByTimeRange(jobs: ReturnType<typeof listDetectionJobs>, timeRange?: TimeRange) {
  if (!timeRange) {
    // Default: today's jobs
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return jobs.filter((j) => new Date(j.createdAt) >= today);
  }

  const minutes = getTimeRangeInMinutes(timeRange);
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  return jobs.filter((j) => new Date(j.createdAt) >= cutoff);
}

function parseCsvForChart(csvPath: string): Promise<Array<{ time: string; value: number }>> {
  return fs
    .readFile(csvPath, "utf8")
    .then((content) => {
      const lines = content.trim().split(/\r?\n/);
      if (lines.length <= 1) return [];
      const data: Array<{ time: string; value: number }> = [];
      for (const line of lines.slice(1)) {
        const parts = line.split(",");
        if (parts.length < 3) continue;
        const people = Number(parts[2]) || 0;
        const timestamp = parts[1] || "";
        const timeLabel = timestamp ? formatTime(timestamp) : "";
        data.push({ time: timeLabel, value: people });
      }
      return data.slice(-24);
    })
    .catch(() => []);
}

function formatTime(timestamp: string): string {
  try {
    const num = Number(timestamp);
    if (!Number.isFinite(num)) return timestamp;
    const hours = Math.floor(num / 3600);
    const minutes = Math.floor((num % 3600) / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  } catch {
    return timestamp;
  }
}

function deriveAlertsFromJobs(jobs: ReturnType<typeof listDetectionJobs>): AlertSummary[] {
  const alerts: AlertSummary[] = [];
  const now = new Date();
  for (const job of jobs) {
    if (job.status !== "completed" || !job.stats) continue;
    const { maxPeople, currentMax } = job.stats;
    const threshold = job.config.baseMax * (job.config.confidence / 100);
    if (maxPeople >= threshold * 0.8) {
      const level: "low" | "medium" | "high" =
        maxPeople >= threshold * 0.95 ? "high" : maxPeople >= threshold * 0.85 ? "medium" : "low";
      alerts.push({
        id: `alert-${job.id}`,
        level,
        message:
          level === "high"
            ? "Crowd surge detected"
            : level === "medium"
              ? "Area nearing capacity"
              : "Density rising",
        peopleCount: maxPeople,
        triggeredAt: job.updatedAt,
        zone: job.sourceName,
      });
    }
  }
  return alerts
    .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
    .slice(0, 10);
}

function aggregateChartData(jobs: ReturnType<typeof listDetectionJobs>): Promise<Array<{ time: string; value: number }>> {
  const completedJobs = jobs.filter((j) => j.status === "completed" && j.artifacts?.csv);
  if (completedJobs.length === 0) {
    return Promise.resolve(
      Array.from({ length: 24 }, (_, i) => ({
        time: `${String(i).padStart(2, "0")}:00`,
        value: 0,
      })),
    );
  }
  const latestJob = completedJobs[0];
  if (!latestJob.artifacts?.csv) {
    return Promise.resolve(
      Array.from({ length: 24 }, (_, i) => ({
        time: `${String(i).padStart(2, "0")}:00`,
        value: 0,
      })),
    );
  }
  const csvPath = path.resolve(runsDir, latestJob.artifacts.csv.replace(/^\/runs\//, ""));
  return parseCsvForChart(csvPath).then((data) => {
    if (data.length === 0) {
      return Array.from({ length: 24 }, (_, i) => ({
        time: `${String(i).padStart(2, "0")}:00`,
        value: 0,
      }));
    }
    return data;
  });
}

function calculateStats(jobs: ReturnType<typeof listDetectionJobs>): {
  detectionsToday: number;
  averageCrowdCount: number;
  activeAlerts: number;
  processingJobs: number;
  avgDensity: number;
} {
  let detectionsToday = 0;
  let totalPeopleSum = 0;
  let totalFrames = 0;
  let totalDensity = 0;
  let densityCount = 0;

  for (const job of jobs) {
    if (job.stats) {
      // Total detections (sum of all people in all frames)
      detectionsToday += job.stats.totalDetections;

      // For average calculation: sum of people across frames
      // totalDetections = sum of people in all frames
      // So we can use it directly
      totalPeopleSum += job.stats.totalDetections;

      // Get frame count from stats if available
      // Note: stats.totalDetections is already the sum, we need processedFrames
      // We'll calculate average using averagePeople * processedFrames for accuracy
      if (job.stats.averagePeople !== undefined) {
        // If we have processedFrames in stats, use it
        const frames = Math.round(job.stats.totalDetections / (job.stats.averagePeople || 1));
        totalFrames += frames;
      }

      if (job.stats.currentMax > 0) {
        const density = (job.stats.averagePeople / job.stats.currentMax) * 100;
        totalDensity += density;
        densityCount += 1;
      }
    }
  }

  // Calculate average crowd count: total people / total frames
  const averageCrowdCount = totalFrames > 0 ? Math.round(totalPeopleSum / totalFrames) : 0;

  const activeAlerts = jobs.filter(
    (j) =>
      j.status === "completed" &&
      j.stats &&
      j.config.baseMax * (j.config.confidence / 100) * 0.8 <= j.stats.maxPeople,
  ).length;
  const processingJobs = jobs.filter((j) => j.status === "running" || j.status === "queued").length;
  const avgDensity = densityCount > 0 ? Math.round((totalDensity / densityCount) * 10) / 10 : 0;

  return { detectionsToday, averageCrowdCount, activeAlerts, processingJobs, avgDensity };
}

function mapJobToDetectionJob(job: ReturnType<typeof listDetectionJobs>[0]): DetectionJob {
  const startedAt = job.createdAt;
  const completedAt = job.status === "completed" ? job.updatedAt : undefined;
  const durationSeconds =
    startedAt && completedAt
      ? Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
      : 0;
  return {
    id: job.id,
    name: job.sourceName,
    status: job.status === "running" ? "processing" : job.status === "queued" ? "processing" : job.status,
    maxPeople: job.stats?.maxPeople || 0,
    durationSeconds,
    startedAt,
    completedAt,
    videoUrl: job.artifacts?.video, // Include video URL if available
  };
}

router.get("/api/dashboard/stats", async (req, res) => {
  try {
    const timeRange = req.query.timeRange as TimeRange | undefined;
    const allJobs = listDetectionJobs();

    // Filter jobs by time range
    const filteredJobs = filterJobsByTimeRange(allJobs, timeRange);

    const stats = calculateStats(filteredJobs);
    const alerts = deriveAlertsFromJobs(filteredJobs);
    const chart = await aggregateChartData(filteredJobs);
    const detectionJobs = filteredJobs.slice(0, 10).map(mapJobToDetectionJob);

    const response: DashboardStatsResponse = {
      totals: {
        ...stats,
        timeRangeLabel: timeRange ? getTimeRangeLabel(timeRange) : "Today",
      },
      jobs: detectionJobs,
      alerts,
      chart,
    };
    res.json(response);
  } catch (error) {
    console.error("[dashboard:stats] Failed to compute stats", error);
    res.status(500).json({ message: "Failed to compute dashboard stats" });
  }
});

// Get currently processing jobs for live stream display
router.get("/api/dashboard/processing-jobs", (_req, res) => {
  try {
    const jobs = listDetectionJobs();
    const processingJobs = jobs
      .filter((j) => j.status === "running" || j.status === "queued")
      .slice(0, 4) // Limit to 4 concurrent streams
      .map((job) => ({
        id: job.id,
        name: job.sourceName,
        status: job.status,
        streamUrl: `/api/detection/jobs/${job.id}/stream`,
        stats: job.stats,
      }));
    res.json({ jobs: processingJobs });
  } catch (error) {
    console.error("[dashboard:processing-jobs] Failed to get processing jobs", error);
    res.status(500).json({ message: "Failed to get processing jobs" });
  }
});

export default router;

