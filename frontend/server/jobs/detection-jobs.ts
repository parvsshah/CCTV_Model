import { spawn, exec } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";
import { promisify } from "util";
import { createHash } from "crypto";
import { detectFileExtension } from "../utils/file-utils";
import { isDBConnected } from "../db/connection.js";
import JobModel from "../db/models/Job.js";
import AlertModel from "../db/models/Alert.js";
import ResultModel from "../db/models/Result.js";

const execAsync = promisify(exec);
import {
  DetectionConfig,
  DetectionJobStats,
  DetectionJobStatus,
  DetectionJobSummary,
  DetectionPredictionResponse,
  DetectionPredictionStats,
  DetectionSourceType,
  PredictionPoint,
} from "@shared/api";

interface DetectionJobInternal {
  id: string;
  status: DetectionJobStatus;
  sourceType: DetectionSourceType;
  sourceName: string;
  sourcePath: string;
  createdAt: Date;
  updatedAt: Date;
  config: DetectionConfig;
  notes?: string;
  logs: string[];
  startedAt?: Date;
  finishedAt?: Date;
  processPid?: number;
  artifacts?: {
    video?: string;
    csv?: string;
    alerts?: string[];
  };
  video?: string;  // Direct reference to the processed video
  stats?: DetectionJobStats;
  prediction?: DetectionPredictionInternal;
  error?: string;
  snapshot?: ArtifactSnapshot;
}

interface DetectionPredictionInternal {
  futureSteps: number;
  generatedAt: Date;
  csv?: string;
  plot?: string;
  stats?: DetectionPredictionStats;
}

interface ArtifactSnapshot {
  processed: Set<string>;
  alerts: Set<string>;
  tracking: Set<string>;
}

export interface CreateDetectionJobInput {
  sourceType: DetectionSourceType;
  sourcePath: string;
  sourceName: string;
  config: DetectionConfig;
  notes?: string;
}

// ── In-Memory Live Buffer ──

interface LiveDataEntry {
  frameId: number;
  timestamp: number;
  count: number;
  level: string;       // 'green' | 'yellow' | 'red'
  densityName: string; // 'LOW' | 'MODERATE' | 'HIGH'
  currentMax: number;
  threshold30: number;
  threshold60: number;
}

interface LiveAlert {
  id: string;
  frameId: number;
  time: string;
  zone: string;
  type: string;    // 'surge' | 'rising' | 'normal'
  message: string;
}

class LiveBuffer {
  private entries: LiveDataEntry[] = [];
  private readonly capacity: number;
  public alerts: LiveAlert[] = [];
  private alertCount = 0;
  private readonly maxAlerts = 20;

  constructor(capacity = 200) {
    this.capacity = capacity;
  }

  push(entry: LiveDataEntry) {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }
  }

  /** Get the latest N entries (default: all in buffer) */
  getRecent(n?: number): LiveDataEntry[] {
    if (!n) return [...this.entries];
    return this.entries.slice(-n);
  }

  /** Get the latest entry */
  getLatest(): LiveDataEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /** Get the total number of entries pushed (including evicted) */
  get size(): number {
    return this.entries.length;
  }

  addAlert(alert: LiveAlert) {
    if (this.alertCount >= this.maxAlerts) return;
    this.alerts.push(alert);
    this.alertCount++;
    // Keep only last 50 alerts in memory
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-50);
    }
  }
}

const liveBuffers = new Map<string, LiveBuffer>();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..", "..");
// Python scripts are in the parent directory (YOLO-CROWD root)
const projectRoot = path.resolve(frontendRoot, "..");
const scriptPath = path.resolve(projectRoot, "optimized_crowd_detection.py");
const predictionScriptPath = path.resolve(projectRoot, "crowd_prediction.py");
const pythonBin = process.env.PYTHON_BIN ?? "python";

// Paths configuration
const runsDir = path.resolve(projectRoot, "runs");
const processedDir = path.resolve(runsDir, "processed_video");
const alertsDir = path.resolve(runsDir, "alert");
const trackingDir = path.resolve(runsDir, "crowd_tracking");
const predictionsDir = path.resolve(runsDir, "predictions");
const modelPath = path.resolve(projectRoot, "yolo-crowd.pt");

// Uploads directory
const uploadsDir = process.env.DETECTION_UPLOAD_DIR ?? path.resolve(frontendRoot, "uploads");

import https from "https";
import fsStream from "fs";

// Helper for robust downloading with redirect handling
async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      // Handle redirects (GitHub uses these for releases)
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: Status ${response.statusCode}`));
        return;
      }

      const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
      if (contentType.includes("text/html")) {
        reject(new Error(`Refusing to download model: Content-Type is ${contentType || "text/html"}`));
        response.resume(); // drain
        return;
      }

      const file = fsStream.createWriteStream(dest);
      response.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve();
      });

      file.on("error", (err) => {
        fsStream.unlink(dest, () => reject(err));
      });
    });

    request.on("error", (err) => {
      fsStream.unlink(dest, () => reject(err));
    });
  });
}

async function validateModelFile(filePath: string): Promise<void> {
  const stats = await fs.stat(filePath);
  // YOLOv5 .pt weights are typically many MB. Anything under 5MB is almost always not real weights.
  if (stats.size < 5 * 1024 * 1024) {
    throw new Error(`Model file is too small (${stats.size} bytes)`);
  }

  // Guard against HTML error pages saved as .pt
  const fd = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(512);
    const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
    const head = buf.slice(0, bytesRead).toString("utf8").toLowerCase();
    if (head.includes("<!doctype html") || head.includes("<html") || head.includes("github.com")) {
      throw new Error("Model file looks like an HTML page, not a PyTorch checkpoint");
    }
  } finally {
    await fd.close();
  }
}

// Verify model exists or download it
export async function verifyModelExists() {
  try {
    await validateModelFile(modelPath);
    return true;
  } catch (error) {
    console.log(`[INFO] YOLO model not found or corrupted. Attempting to download...`);
    
    // Release URL
    const modelUrl = "https://github.com/parvsshah/CCTV_Model/releases/download/v1.0.0/yolo-crowd.pt";
    
    try {
      await downloadFile(modelUrl, modelPath);
      
      // Verify after download
      await validateModelFile(modelPath);
      const newStats = await fs.stat(modelPath);
      console.log(`[INFO] Successfully downloaded and verified yolo-crowd.pt (${Math.round(newStats.size / (1024*1024))} MB)`);
      return true;
    } catch (downloadError) {
      // Clean up the bad file if any
      await fs.unlink(modelPath).catch(() => {});
      console.error(`[ERROR] Failed to download yolo-crowd.pt:`, downloadError);
      return false;
    }
  }
}

// Verify Python environment
export async function verifyPythonEnvironment() {
  try {
    const { stdout } = await promisify(exec)(`${pythonBin} --version`);
    console.log(`[INFO] Using Python: ${stdout.trim()}`);

    // Check for required Python packages by attempting to import them
    // This is more reliable than parsing pip list strings
    const checkCommand = `${pythonBin} -c "import torch; import torchvision; import cv2; import numpy; print('OK')"`;
    try {
      const { stdout: checkOutput } = await promisify(exec)(checkCommand);
      if (checkOutput.trim() === 'OK') {
        return true;
      }
    } catch (e) {
      console.error(`[ERROR] Missing or broken Python packages.`);
      console.error('Please ensure torch, torchvision, opencv-python, and numpy are installed.');
      return false;
    }

    return true;
  } catch (error) {
    console.error('[ERROR] Failed to verify Python environment:', error);
    return false;
  }
}

// Initialize environment
let isEnvironmentReady = false;
let environmentCheckInProgress = false;

export async function initializeEnvironment() {
  if (isEnvironmentReady) return true;
  if (environmentCheckInProgress) {
    // Wait for the ongoing check to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    return isEnvironmentReady;
  }

  environmentCheckInProgress = true;
  try {
    console.log('[INFO] Verifying environment...');

    // Check model exists
    const modelExists = await verifyModelExists();
    if (!modelExists) return false;

    // Check Python environment
    const pythonOk = await verifyPythonEnvironment();
    if (!pythonOk) return false;

    isEnvironmentReady = true;
    console.log('[INFO] Environment verification successful');
    return true;
  } catch (error) {
    console.error('[ERROR] Environment verification failed:', error);
    return false;
  } finally {
    environmentCheckInProgress = false;
  }
}

// Side effects removed for build-time safety (Vercel compatibility)
// void initializeEnvironment();

const jobs = new Map<string, DetectionJobInternal>();

const dailyJobCounters = new Map<string, number>();


void ensureDirectories().catch((error) => {
  console.error("[detection-jobs] Failed to prepare directories", error);
});

/**
 * Lists all files in a directory (non-recursive)
 * @param dir Directory to list files from
 * @returns Set of absolute file paths
 */
async function listFiles(dir: string): Promise<Set<string>> {
  try {
    // Ensure directory exists and is accessible
    await fs.access(dir);

    // Read directory contents
    const entries = await fs.readdir(dir, { withFileTypes: true });

    // Filter out directories and get absolute paths
    const files = await Promise.all(
      entries
        .filter(entry => entry.isFile())
        .map(entry => path.resolve(dir, entry.name))
    );

    return new Set(files);
  } catch {
    return new Set<string>();
  }
}

function formatDateForId(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

async function findMaxSerialForDate(dateStr: string): Promise<number> {
  try {
    const entries = await fs.readdir(processedDir, { withFileTypes: true });
    let maxSerial = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith(`${dateStr}-`)) continue;
      const serialPart = entry.name.slice(dateStr.length + 1);
      const serial = parseInt(serialPart, 10);
      if (!Number.isNaN(serial) && serial > maxSerial) {
        maxSerial = serial;
      }
    }
    return maxSerial;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    console.error("[detection-jobs] Failed to inspect processed directory for job IDs", error);
    return 0;
  }
}

async function generateJobId(): Promise<string> {
  const now = new Date();
  const dateStr = formatDateForId(now);
  let counter = dailyJobCounters.get(dateStr);
  if (counter === undefined) {
    const maxSerial = await findMaxSerialForDate(dateStr);
    counter = maxSerial;
  }
  counter += 1;
  dailyJobCounters.set(dateStr, counter);
  const serialStr = String(counter).padStart(3, "0");
  return `${dateStr}-${serialStr}`;
}

async function captureSnapshot(): Promise<ArtifactSnapshot> {
  const [processed, alerts, tracking] = await Promise.all([
    listFiles(processedDir),
    listFiles(alertsDir),
    listFiles(trackingDir),
  ]);
  return { processed, alerts, tracking };
}

/**
 * Lists files in a directory that weren't present in the previous snapshot
 * @param previous Set of file paths from the previous snapshot
 * @param dir Directory to scan for new files
 * @returns Array of new file paths
 */
async function listNewFiles(previous: Set<string>, dir: string): Promise<string[]> {
  try {
    // Ensure directory exists
    await fs.access(dir);
    const currentFiles = await listFiles(dir);
    const newFiles: string[] = [];

    // Find files that weren't in the previous snapshot
    for (const file of currentFiles) {
      if (!previous.has(file)) {
        newFiles.push(file);
      }
    }

    // Get file stats for all new files
    const filesWithStats = await Promise.all(
      newFiles.map(async (file) => {
        try {
          const stats = await fs.stat(file);
          return { file, mtime: stats.mtimeMs };
        } catch (e) {
          console.error(`Error getting stats for ${file}:`, e);
          return { file, mtime: 0 };
        }
      })
    );

    // Sort by modification time (newest first)
    return filesWithStats
      .sort((a, b) => b.mtime - a.mtime)
      .map(entry => entry.file);

  } catch (error) {
    // If directory doesn't exist or can't be accessed, return empty array
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`Directory not found: ${dir}`);
      return [];
    }
    console.error(`Error listing new files in ${dir}:`, error);
    throw error;
  }
}

async function listFilesSorted(dir: string, extensions?: string[]): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const filesWithStats = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .filter((entry) => {
          if (!extensions || extensions.length === 0) return true;
          const ext = path.extname(entry.name).toLowerCase();
          return extensions.includes(ext);
        })
        .map(async (entry) => {
          const fullPath = path.join(dir, entry.name);
          try {
            const stats = await fs.stat(fullPath);
            return { file: fullPath, mtime: stats.mtimeMs };
          } catch (e) {
            console.error(`Error getting stats for ${fullPath}:`, e);
            return { file: fullPath, mtime: 0 };
          }
        })
    );
    return filesWithStats.sort((a, b) => b.mtime - a.mtime).map((entry) => entry.file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    console.error(`Error listing files in ${dir}:`, error);
    throw error;
  }
}

async function findLatestFile(dir: string, extensions?: string[]): Promise<string | undefined> {
  const files = await listFilesSorted(dir, extensions);
  return files[0];
}

function makePublicPath(filePath?: string) {
  if (!filePath) return undefined;
  const relative = path.relative(runsDir, filePath);
  if (relative.startsWith("..")) return undefined;
  return `/runs/${relative.split(path.sep).join("/")}`;
}

async function summarizeCsv(filePath: string): Promise<DetectionJobStats | undefined> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.trim().split(/\r?\n/);
    if (lines.length <= 1) return undefined;
    let totalDetections = 0;
    let maxPeople = 0;
    let currentMax = 0;
    let rowCount = 0;
    for (const line of lines.slice(1)) {
      const parts = line.split(",");
      if (parts.length < 6) continue;
      const people = Number(parts[2]) || 0;
      const currMax = Number(parts[5]) || 0;
      totalDetections += people;
      if (people > maxPeople) maxPeople = people;
      currentMax = currMax;
      rowCount += 1;
    }
    const averagePeople = rowCount ? totalDetections / rowCount : 0;
    return {
      totalDetections,
      maxPeople,
      averagePeople: Number(averagePeople.toFixed(2)),
      currentMax,
    };
  } catch (error) {
    console.warn("[detection-jobs] Failed to summarize CSV", error);
    return undefined;
  }
}

function serializeJob(job: DetectionJobInternal): DetectionJobSummary {
  return {
    id: job.id,
    status: job.status,
    sourceType: job.sourceType,
    sourceName: job.sourceName,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    config: job.config,
    artifacts: job.artifacts
      ? {
        video: makePublicPath(job.artifacts.video),
        csv: makePublicPath(job.artifacts.csv),
        alerts: job.artifacts.alerts?.map((file) => makePublicPath(file)!),
      }
      : undefined,
    stats: job.stats,
    prediction: job.prediction
      ? {
        futureSteps: job.prediction.futureSteps,
        generatedAt: job.prediction.generatedAt.toISOString(),
        csv: makePublicPath(job.prediction.csv),
        plot: makePublicPath(job.prediction.plot),
      }
      : undefined,
    error: job.error,
  };
}

function parseConfidence(confidence: number) {
  if (confidence > 1) {
    return Math.min(Math.max(confidence / 100, 0.01), 0.99);
  }
  return Math.min(Math.max(confidence, 0.01), 0.99);
}

function buildArgs(job: DetectionJobInternal) {
  // Ensure output directory exists
  const outputDir = path.join(processedDir, job.id);

  // Build the command line arguments
  const args = [
    scriptPath,
    '--source', job.sourcePath,
    '--weights', path.resolve(projectRoot, 'yolo-crowd.pt'),
    '--conf-thres', (job.config.confidence / 100).toFixed(2),
    '--base-max', job.config.baseMax.toString(),
    '--frame-skip', job.config.frameSkip.toString(),
    '--output', outputDir,
    '--img-size', '640', // Standard YOLO input size
    '--device', '0', // Use first available GPU if present, else CPU
    '--project', path.resolve(projectRoot, 'runs/detect'),
    '--name', `job_${job.id}`,
    '--exist-ok', // Overwrite existing files
  ];

  // Add max frames if specified
  if (job.config.maxFrames > 0) {
    args.push('--max-frames', job.config.maxFrames.toString());
  }

  // Enable frame streaming for web dashboard
  args.push('--stream-frames');

  console.log(`[DEBUG] Python command: ${pythonBin} ${args.join(' ')}`);
  return args;
}

async function collectArtifacts(job: DetectionJobInternal) {
  const jobProcessedDir = path.join(processedDir, job.id, "processed");
  const jobTrackingDir = path.join(processedDir, job.id, "tracking");
  const jobAlertsDir = path.join(processedDir, job.id, "alerts");

  const [latestVideo, latestTracking, jobAlerts] = await Promise.all([
    findLatestFile(jobProcessedDir, [".mp4", ".avi", ".mov", ".mkv", ".webm", ".wmv", ".flv", ".m4v"]),
    findLatestFile(jobTrackingDir, [".csv"]),
    listFilesSorted(jobAlertsDir).catch(() => []),
  ]);

  job.artifacts = {
    video: latestVideo,
    csv: latestTracking,
    alerts: jobAlerts,
  };

  if (job.artifacts.csv) {
    job.stats = await summarizeCsv(job.artifacts.csv);
  }
}

async function watchProcess(job: DetectionJobInternal) {
  const args = buildArgs(job);
  const outputDir = path.join(processedDir, job.id);
  const cwd = path.dirname(scriptPath); // Define cwd here

  try {
    // Ensure all required directories exist
    await Promise.all([
      fs.mkdir(uploadsDir, { recursive: true }),
      fs.mkdir(runsDir, { recursive: true }),
      fs.mkdir(processedDir, { recursive: true }),
      fs.mkdir(alertsDir, { recursive: true }),
      fs.mkdir(trackingDir, { recursive: true }),
    ]);

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Create a snapshot of existing files
    job.snapshot = await captureSnapshot();

    // Update job status
    job.status = 'running' as DetectionJobStatus;
    job.startedAt = new Date();
    job.updatedAt = new Date();
    job.logs = [];
    job.logs.push(`[${job.startedAt.toISOString()}] Starting video processing...`);

    console.log(`[JOB ${job.id}] Starting video processing...`);
    console.log(`[JOB ${job.id}] Command: ${pythonBin} ${args.join(' ')}`);
    console.log(`[JOB ${job.id}] Working directory: ${cwd}`);

    // Create live buffer for real-time dashboard updates
    liveBuffers.set(job.id, new LiveBuffer());

    // Start periodic artifact collection (every 5s) so CSV/stats are available mid-processing
    const artifactTimer = setInterval(async () => {
      try {
        await collectArtifacts(job);
        jobs.set(job.id, job);
      } catch (e) {
        // Non-fatal: artifact collection failure shouldn't stop processing
      }
    }, 5000);

    // Run the Python script with our enhanced process handler
    await runPythonProcess(args, cwd, job);

    // Stop periodic artifact collection
    clearInterval(artifactTimer);

    // If we get here, processing completed successfully
    job.status = 'completed' as DetectionJobStatus;
    job.finishedAt = new Date();
    job.updatedAt = new Date();
    const duration = (job.finishedAt.getTime() - job.startedAt.getTime()) / 1000;
    job.logs.push(`[${job.finishedAt.toISOString()}] Processing completed successfully in ${duration.toFixed(2)} seconds`);

    // Collect generated artifacts
    await collectArtifacts(job);

    // Process the CSV to generate statistics
    if (job.artifacts?.csv) {
      job.stats = await summarizeCsv(job.artifacts.csv);
    }

    // If we have a video file, update the job with its path
    if (job.artifacts?.video) {
      job.video = job.artifacts.video;
    }

    // Persist completion to MongoDB
    await updateJobInDB(job);
    await persistAlertsForJob(job);
    await persistDetectionResultToDB(job);

  } catch (error) {
    // Handle any errors in the process
    const errorMsg = error instanceof Error ? error.message : String(error);
    job.status = 'failed' as DetectionJobStatus;
    job.error = `Processing failed: ${errorMsg}`;
    job.updatedAt = new Date();
    job.logs.push(`[ERROR] ${job.error}`);
    console.error(`[JOB ${job.id}] ${job.error}`);

    // Persist failure to MongoDB
    await updateJobInDB(job);

    // Clean up any resources if needed
    if (job.processPid) {
      try {
        process.kill(job.processPid, 'SIGTERM');
      } catch (e) {
        console.error(`[JOB ${job.id}] Failed to kill process: ${e}`);
      }
      job.processPid = undefined;
    }
  } finally {
    // Ensure job is updated in the jobs map
    jobs.set(job.id, job);
    // Note: don't delete liveBuffers here — keep for a grace period so the
    // frontend can fetch the final state. Clean up after 60s.
    setTimeout(() => {
      liveBuffers.delete(job.id);
    }, 60_000);
  }
}

export async function createDetectionJob(
  input: CreateDetectionJobInput,
): Promise<DetectionJobSummary> {
  let sourcePath = input.sourcePath;
  let sourceName = input.sourceName;

  if (input.sourceType === "upload") {
    const ext = path.extname(sourcePath).toLowerCase();
    const allowedExtensions = [
      ".mp4",
      ".avi",
      ".mov",
      ".mkv",
      ".webm",
      ".wmv",
      ".flv",
      ".m4v",
      ".mpg",
      ".mpeg",
    ];

    if (!ext || !allowedExtensions.includes(ext)) {
      try {
        const detectedExt = await detectFileExtension(sourcePath);
        if (detectedExt && allowedExtensions.includes(detectedExt)) {
          const newPath = `${sourcePath}${detectedExt}`;
          await fs.rename(sourcePath, newPath);
          sourcePath = newPath;
          if (!path.extname(sourceName)) {
            sourceName = `${sourceName}${detectedExt}`;
          }
        } else {
          throw new Error(
            `Invalid file type. Allowed types: ${allowedExtensions.join(", ")}`,
          );
        }
      } catch (error) {
        console.error("[detection-jobs] Failed to ensure video extension", error);
        throw error;
      }
    }
  }

  const id = await generateJobId();
  const now = new Date();
  const job: DetectionJobInternal = {
    id,
    status: "queued",
    sourceType: input.sourceType,
    sourceName,
    sourcePath,
    createdAt: now,
    updatedAt: now,
    config: input.config,
    notes: input.notes,
    logs: [],
  };

  job.snapshot = await captureSnapshot();
  jobs.set(id, job);

  // Persist to MongoDB
  await persistJobToDB(job, input);

  void watchProcess(job);

  return serializeJob(job);
}

export function getDetectionJob(id: string) {
  const job = jobs.get(id);
  return job ? serializeJob(job) : undefined;
}

export function getLiveData(jobId: string) {
  const buffer = liveBuffers.get(jobId);
  const job = jobs.get(jobId);
  if (!buffer || !job) return null;

  const recent = buffer.getRecent(30); // Last 30 data points for chart
  const latest = buffer.getLatest();

  const chartData = recent.map((e) => {
    const minutes = Math.floor(e.timestamp / 60);
    const seconds = Math.floor(e.timestamp % 60);
    return {
      time: `${minutes}:${String(seconds).padStart(2, "0")}`,
      count: e.count,
      frameId: e.frameId,
    };
  });

  return {
    jobId,
    status: job.status,
    currentCount: latest?.count ?? 0,
    crowdLevel: latest?.densityName ?? "LOW",
    currentMax: latest?.currentMax ?? 0,
    threshold30: latest?.threshold30 ?? 0,
    threshold60: latest?.threshold60 ?? 0,
    chartData,
    alerts: buffer.alerts.slice(-10), // Last 10 alerts
    totalFrames: buffer.size,
  };
}

export function listDetectionJobs() {
  return Array.from(jobs.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((job) => serializeJob(job));
}

// Ensure all required directories exist on startup
export async function ensureDirectories() {
  const dirs = [
    runsDir,
    processedDir,
    alertsDir,
    trackingDir,
    predictionsDir,
    uploadsDir
  ];

  await Promise.all(dirs.map(dir =>
    fs.mkdir(dir, { recursive: true })
      .catch(err => console.error(`Error creating directory ${dir}:`, err))
  ));

  console.log('Ensured all required directories exist');
  return true;
}

// Side effects removed for build-time safety
// void ensureDirectories().then(() =>
//   console.log('Directory initialization complete')
// ).catch(console.error);

export const detectionPaths = {
  uploadsDir,
  runsDir,
  processedDir,
  alertsDir,
  trackingDir,
  predictionsDir,
};

function fileExists(filePath: string | undefined) {
  if (!filePath) return Promise.resolve(false);
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

async function parsePredictionCsv(filePath: string): Promise<PredictionPoint[]> {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const [frameIdRaw, timestampRaw, actualRaw, predictedRaw] = line.split(",");
    const frameId = Number(frameIdRaw);
    const timestamp = timestampRaw ? Number(timestampRaw) : null;
    const actualCount = actualRaw ? Number(actualRaw) : null;
    const predictedCount = predictedRaw ? Number(predictedRaw) : 0;
    return {
      frameId,
      timestamp: Number.isFinite(timestamp) ? timestamp : null,
      actualCount: Number.isFinite(actualCount ?? NaN) ? actualCount : null,
      predictedCount,
    };
  });
}

function computePredictionStats(points: PredictionPoint[], futureSteps: number): DetectionPredictionStats {
  const historical = points.filter((p) => p.actualCount !== null && Number.isFinite(p.actualCount ?? NaN));
  const n = historical.length || 1;
  let mae = 0;
  let rmse = 0;
  for (const point of historical) {
    const actual = point.actualCount ?? 0;
    const error = actual - point.predictedCount;
    mae += Math.abs(error);
    rmse += error * error;
  }
  mae = historical.length ? mae / historical.length : 0;
  rmse = historical.length ? Math.sqrt(rmse / historical.length) : 0;
  return {
    mae: Number(mae.toFixed(3)),
    rmse: Number(rmse.toFixed(3)),
    historicalPoints: historical.length,
    futureSteps,
  };
}
async function runPythonProcess(args: string[], cwd: string, job: DetectionJobInternal | string) {
  const jobId = typeof job === 'string' ? job : job.id;
  // Ensure the environment is ready
  const isReady = await initializeEnvironment();
  if (!isReady) {
    throw new Error('Python environment is not properly configured');
  }

  // Set up environment variables
  const env = {
    ...process.env,
    PYTHONPATH: projectRoot,
    MODEL_PATH: modelPath,
  };

  // Handle paths with spaces by wrapping them in quotes
  const escapedArgs = args.map(arg => {
    // If the argument is a file path with spaces, wrap it in quotes
    if (arg.includes(' ') && (arg.startsWith('/') || arg.startsWith('./') || arg.startsWith('../'))) {
      return `"${arg}"`;
    }
    return arg;
  });

  // Log the command being executed
  const command = `${pythonBin} ${escapedArgs.join(' ')}`;
  console.log(`[JOB ${jobId || 'unknown'}] Executing: ${command} in ${cwd}`);

  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    // Use the original args for spawn (not the escaped ones)
    const childProcess = spawn(pythonBin, args, {
      cwd,
      env,
      shell: false, // Set to false to avoid shell injection and handle paths with spaces
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Store the process PID in the job if job object was passed
    if (typeof job !== 'string' && childProcess.pid) {
      job.processPid = childProcess.pid;
      jobs.set(job.id, job);
      console.log(`[JOB ${jobId}] Process PID: ${childProcess.pid}`);
    }

    let stdout = '';
    let stderr = '';
    const startTime = Date.now();

    // Log process output in real-time
    childProcess.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (!text) return;

      stdout += text + '\n';
      const lines = text.split('\n').filter(Boolean);
      lines.forEach(line => {
        // Parse [DATA] lines into the live buffer
        if (line.startsWith('[DATA]')) {
          try {
            const jsonStr = line.substring(6); // Remove '[DATA]' prefix
            const d = JSON.parse(jsonStr);
            const buffer = liveBuffers.get(jobId);
            if (buffer) {
              const entry: LiveDataEntry = {
                frameId: d.f,
                timestamp: d.t,
                count: d.c,
                level: d.l,
                densityName: d.d,
                currentMax: d.m,
                threshold30: d.t30,
                threshold60: d.t60,
              };
              buffer.push(entry);

              // Real-time alert generation on HIGH density
              if (d.d === 'HIGH') {
                const minutes = Math.floor(d.t / 60);
                const seconds = Math.floor(d.t % 60);
                const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;
                buffer.addAlert({
                  id: `alert-${jobId}-${d.f}`,
                  frameId: d.f,
                  time: timeStr,
                  zone: typeof job !== 'string' ? job.sourceName : 'Stream',
                  type: 'surge',
                  message: `Crowd surge: ${d.c} people detected (frame ${d.f})`,
                });
              } else if (d.d === 'MODERATE' && d.c > d.m * 0.5) {
                const minutes = Math.floor(d.t / 60);
                const seconds = Math.floor(d.t % 60);
                const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;
                buffer.addAlert({
                  id: `alert-${jobId}-${d.f}`,
                  frameId: d.f,
                  time: timeStr,
                  zone: typeof job !== 'string' ? job.sourceName : 'Stream',
                  type: 'rising',
                  message: `Density rising: ${d.c} people detected (frame ${d.f})`,
                });
              }
            }
          } catch (e) {
            // Ignore malformed [DATA] lines
          }
          return; // Don't log [DATA] lines to console
        }
        console.log(`[JOB ${jobId || 'unknown'}] ${line}`);
      });
    });

    childProcess.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (!text) return;

      stderr += text + '\n';
      const lines = text.split('\n').filter(Boolean);
      lines.forEach(line => {
        console.error(`[JOB ${jobId || 'unknown'}-ERROR] ${line}`);
      });
    });

    childProcess.on('error', (error) => {
      console.error(`[JOB ${jobId || 'unknown'}-ERROR] Process error:`, error);
      reject(new Error(`Process failed to start: ${error.message}`));
    });

    childProcess.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (code === 0) {
        console.log(`[JOB ${jobId || 'unknown'}] Process completed successfully in ${duration}s`);
        resolve({ stdout, stderr });
      } else {
        const error = new Error(
          `Process exited with code ${code} after ${duration}s\n` +
          `Command: ${command}\n` +
          `Working directory: ${cwd}\n` +
          `Error output:\n${stderr || 'No error output'}`
        );
        console.error(`[JOB ${jobId || 'unknown'}-ERROR] ${error.message}`);
        reject(error);
      }
    });
  });
}

export async function runPredictionForJob(jobId: string, futureSteps: number): Promise<DetectionPredictionResponse> {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error("Job not found");
  }
  if (!job.artifacts?.csv) {
    throw new Error("Job CSV artifact not available");
  }

  const safeFuture = Math.max(1, Math.min(500, Math.round(futureSteps)));
  const outputBase = `${job.id}-${Date.now()}`;
  const csvOut = path.resolve(predictionsDir, `${outputBase}.csv`);

  const args = [
    predictionScriptPath,
    "--csv",
    job.artifacts.csv,
    "--future",
    String(safeFuture),
    "--out",
    csvOut,
  ];

  await runPythonProcess(args, projectRoot, jobId);

  const data = await parsePredictionCsv(csvOut);
  const stats = computePredictionStats(data, safeFuture);
  const plotPath = csvOut.replace(/\.csv$/, ".png");
  const hasPlot = await fileExists(plotPath);

  job.prediction = {
    futureSteps: safeFuture,
    generatedAt: new Date(),
    csv: csvOut,
    plot: hasPlot ? plotPath : undefined,
    stats,
  };
  job.updatedAt = new Date();

  // Persist result to MongoDB
  await persistResultToDB(job.id, csvOut, stats, hasPlot ? plotPath : undefined);

  return {
    jobId: job.id,
    predictions: data,
    stats,
    artifacts: {
      csv: makePublicPath(csvOut),
      plot: hasPlot ? makePublicPath(plotPath) : undefined,
    },
  };
}

export async function terminateDetectionJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  if (job.status !== "running") {
    throw new Error("Job is not running");
  }

  console.log(`[JOB ${jobId}] Terminating job...`);

  // Kill the process if it exists
  if (job.processPid) {
    try {
      process.kill(job.processPid, 'SIGTERM');
      console.log(`[JOB ${jobId}] Sent SIGTERM to process ${job.processPid}`);

      // Wait a bit, then force kill if still running
      setTimeout(() => {
        try {
          process.kill(job.processPid!, 'SIGKILL');
          console.log(`[JOB ${jobId}] Sent SIGKILL to process ${job.processPid}`);
        } catch (e) {
          // Process already dead, ignore
        }
      }, 2000);
    } catch (error) {
      console.error(`[JOB ${jobId}] Failed to kill process:`, error);
    }
  }

  // Update job status
  job.status = 'failed' as DetectionJobStatus;
  job.error = 'Job terminated by user';
  job.finishedAt = new Date();
  job.updatedAt = new Date();
  job.logs.push(`[${job.finishedAt.toISOString()}] Job terminated by user`);
  job.processPid = undefined;

  // Collect any artifacts that were generated
  await collectArtifacts(job);

  // Persist termination to MongoDB
  await updateJobInDB(job);

  jobs.set(jobId, job);
  console.log(`[JOB ${jobId}] Job terminated successfully`);
}

// ── MongoDB Persistence Helpers ──

async function persistJobToDB(job: DetectionJobInternal, input: CreateDetectionJobInput) {
  if (!isDBConnected()) return;
  try {
    await JobModel.create({
      jobId: job.id,
      status: job.status,
      sourceType: job.sourceType,
      sourceName: job.sourceName,
      sourcePath: job.sourcePath,
      config: job.config,
      notes: job.notes,
      uploadedFile: input.sourceType === "upload" ? {
        originalName: input.sourceName,
        size: 0,
        storedPath: input.sourcePath,
      } : undefined,
      startedAt: job.startedAt,
    });
    console.log(`[MongoDB] Job ${job.id} persisted`);
  } catch (error) {
    console.error(`[MongoDB] Failed to persist job ${job.id}:`, error);
  }
}

async function updateJobInDB(job: DetectionJobInternal) {
  if (!isDBConnected()) return;
  try {
    await JobModel.findOneAndUpdate(
      { jobId: job.id },
      {
        status: job.status,
        stats: job.stats,
        error: job.error,
        processPid: job.processPid,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
      },
    );
    console.log(`[MongoDB] Job ${job.id} updated (${job.status})`);
  } catch (error) {
    console.error(`[MongoDB] Failed to update job ${job.id}:`, error);
  }
}

async function persistAlertsForJob(job: DetectionJobInternal) {
  if (!isDBConnected()) return;
  if (!job.stats || job.status !== "completed") return;

  try {
    const dbJob = await JobModel.findOne({ jobId: job.id });
    if (!dbJob) return;

    const { maxPeople } = job.stats;
    const threshold = job.config.baseMax * (job.config.confidence / 100);

    if (maxPeople >= threshold * 0.8) {
      const level: "low" | "medium" | "high" =
        maxPeople >= threshold * 0.95 ? "high" : maxPeople >= threshold * 0.85 ? "medium" : "low";

      await AlertModel.create({
        jobId: dbJob._id,
        level,
        message:
          level === "high"
            ? "Crowd surge detected"
            : level === "medium"
              ? "Area nearing capacity"
              : "Density rising",
        peopleCount: maxPeople,
        zone: job.sourceName,
        triggeredAt: new Date(),
      });
      console.log(`[MongoDB] Alert created for job ${job.id} (${level})`);
    }
  } catch (error) {
    console.error(`[MongoDB] Failed to persist alerts for job ${job.id}:`, error);
  }
}

async function persistResultToDB(jobId: string, csvPath: string | undefined, stats: DetectionPredictionStats | undefined, plotPath: string | undefined) {
  if (!isDBConnected()) return;
  try {
    const dbJob = await JobModel.findOne({ jobId });
    if (!dbJob) return;

    // Try to find existing detection result for this job and update it with prediction data
    const existing = await ResultModel.findOne({ jobId: dbJob._id });
    if (existing) {
      await ResultModel.findByIdAndUpdate(existing._id, {
        csvFileId: csvPath || existing.csvFileId,
        predictedCount: stats?.futureSteps,
        predictionStats: stats ? {
          mae: stats.mae,
          rmse: stats.rmse,
          historicalPoints: stats.historicalPoints,
          futureSteps: stats.futureSteps,
        } : undefined,
        plotPath,
        generatedAt: new Date(),
      });
      console.log(`[MongoDB] Result updated with prediction data for job ${jobId}`);
      return;
    }

    // No existing result — create new one (shouldn't happen if detection ran first)
    await ResultModel.create({
      jobId: dbJob._id,
      csvFileId: csvPath,
      predictedCount: stats?.futureSteps,
      predictionStats: stats ? {
        mae: stats.mae,
        rmse: stats.rmse,
        historicalPoints: stats.historicalPoints,
        futureSteps: stats.futureSteps,
      } : undefined,
      plotPath,
      generatedAt: new Date(),
    });
    console.log(`[MongoDB] Result persisted for job ${jobId}`);
  } catch (error) {
    console.error(`[MongoDB] Failed to persist result for job ${jobId}:`, error);
  }
}

async function persistDetectionResultToDB(job: DetectionJobInternal) {
  if (!isDBConnected()) return;
  if (!job.artifacts?.csv && !job.stats) return;

  try {
    const dbJob = await JobModel.findOne({ jobId: job.id });
    if (!dbJob) return;

    // Check if a result already exists for this job
    const existing = await ResultModel.findOne({ jobId: dbJob._id });
    if (existing) {
      // Update existing result with detection data (keep predictedCount null if not set)
      await ResultModel.findByIdAndUpdate(existing._id, {
        csvFileId: job.artifacts?.csv,
        generatedAt: new Date(),
      });
      console.log(`[MongoDB] Detection result updated for job ${job.id}`);
      return;
    }

    // Create new result with predictedCount as null (prediction hasn't run yet)
    await ResultModel.create({
      jobId: dbJob._id,
      csvFileId: job.artifacts?.csv,
      predictedCount: null,
      predictionStats: undefined,
      plotPath: undefined,
      generatedAt: new Date(),
    });
    console.log(`[MongoDB] Detection result persisted for job ${job.id} (predictedCount: null)`);
  } catch (error) {
    console.error(`[MongoDB] Failed to persist detection result for job ${job.id}:`, error);
  }
}

