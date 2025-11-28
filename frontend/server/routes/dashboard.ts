import { Router } from "express";
import { DashboardStatsResponse, DetectionJob, AlertSummary } from "@shared/api";
import { listDetectionJobs } from "../jobs/detection-jobs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..", "..");
// Runs directory is in the parent directory (YOLO-CROWD root)
const projectRoot = path.resolve(frontendRoot, "..");
const runsDir = path.resolve(projectRoot, "runs");
const trackingDir = path.resolve(runsDir, "crowd_tracking");

const router = Router();

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
  activeAlerts: number;
  processingJobs: number;
  avgDensity: number;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayJobs = jobs.filter((j) => new Date(j.createdAt) >= today);
  let detectionsToday = 0;
  let totalDensity = 0;
  let densityCount = 0;
  for (const job of todayJobs) {
    if (job.stats) {
      detectionsToday += job.stats.totalDetections;
      if (job.stats.currentMax > 0) {
        const density = (job.stats.averagePeople / job.stats.currentMax) * 100;
        totalDensity += density;
        densityCount += 1;
      }
    }
  }
  const activeAlerts = jobs.filter(
    (j) =>
      j.status === "completed" &&
      j.stats &&
      j.config.baseMax * (j.config.confidence / 100) * 0.8 <= j.stats.maxPeople,
  ).length;
  const processingJobs = jobs.filter((j) => j.status === "running" || j.status === "queued").length;
  const avgDensity = densityCount > 0 ? Math.round((totalDensity / densityCount) * 10) / 10 : 0;
  return { detectionsToday, activeAlerts, processingJobs, avgDensity };
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
  };
}

router.get("/api/dashboard/stats", async (_req, res) => {
  try {
    const jobs = listDetectionJobs();
    const stats = calculateStats(jobs);
    const alerts = deriveAlertsFromJobs(jobs);
    const chart = await aggregateChartData(jobs);
    const detectionJobs = jobs.slice(0, 10).map(mapJobToDetectionJob);
    const response: DashboardStatsResponse = {
      totals: stats,
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

