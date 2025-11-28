import { spawn, exec } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";
import { promisify } from "util";
import { createHash } from "crypto";
import { detectFileExtension } from "../utils/file-utils";

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..", "..");
// Python scripts are in the parent directory (YOLO-CROWD root)
const projectRoot = path.resolve(frontendRoot, "..");
const scriptPath = path.resolve(projectRoot, "optimized_crowd_detection.py");
const predictionScriptPath = path.resolve(projectRoot, "crowd_prediction.py");
const pythonBin = process.env.PYTHON_BIN ?? "python3";

// Paths configuration
const runsDir = path.resolve(projectRoot, "runs");
const processedDir = path.resolve(runsDir, "processed_video");
const alertsDir = path.resolve(runsDir, "alert");
const trackingDir = path.resolve(runsDir, "crowd_tracking");
const predictionsDir = path.resolve(runsDir, "predictions");
const modelPath = path.resolve(projectRoot, "yolo-crowd.pt");

// Uploads directory
const uploadsDir = process.env.DETECTION_UPLOAD_DIR ?? path.resolve(frontendRoot, "uploads");

// Verify model exists
async function verifyModelExists() {
  try {
    await fs.access(modelPath);
    return true;
  } catch (error) {
    console.error(`[ERROR] YOLO model not found at: ${modelPath}`);
    console.error('Please ensure the yolo-crowd.pt file exists in the project root.');
    return false;
  }
}

// Verify Python environment
async function verifyPythonEnvironment() {
  try {
    const { stdout } = await promisify(exec)(`${pythonBin} --version`);
    console.log(`[INFO] Using Python: ${stdout.trim()}`);

    // Check for required Python packages
    const { stdout: pipList } = await promisify(exec)(`${pythonBin} -m pip list`);
    const requiredPackages = ['torch', 'torchvision', 'opencv-python', 'numpy'];
    const missingPackages = requiredPackages.filter(pkg => !pipList.includes(pkg));

    if (missingPackages.length > 0) {
      console.error(`[ERROR] Missing required Python packages: ${missingPackages.join(', ')}`);
      console.error('Please install them using: pip install -r requirements.txt');
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

async function initializeEnvironment() {
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

// Initialize environment on startup
void initializeEnvironment();

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

    // Run the Python script with our enhanced process handler
    await runPythonProcess(args, cwd, job.id);

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

  } catch (error) {
    // Handle any errors in the process
    const errorMsg = error instanceof Error ? error.message : String(error);
    job.status = 'failed' as DetectionJobStatus;
    job.error = `Processing failed: ${errorMsg}`;
    job.updatedAt = new Date();
    job.logs.push(`[ERROR] ${job.error}`);
    console.error(`[JOB ${job.id}] ${job.error}`);

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
  void watchProcess(job);

  return serializeJob(job);
}

export function getDetectionJob(id: string) {
  const job = jobs.get(id);
  return job ? serializeJob(job) : undefined;
}

export function listDetectionJobs() {
  return Array.from(jobs.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((job) => serializeJob(job));
}

// Ensure all required directories exist on startup
async function ensureDirectories() {
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

// Run directory check on startup
void ensureDirectories().then(() =>
  console.log('Directory initialization complete')
).catch(console.error);

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
async function runPythonProcess(args: string[], cwd: string, jobId?: string) {
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
    const process = spawn(pythonBin, args, {
      cwd,
      env,
      shell: false, // Set to false to avoid shell injection and handle paths with spaces
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const startTime = Date.now();

    // Log process output in real-time
    process.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (!text) return;

      stdout += text + '\n';
      const lines = text.split('\n').filter(Boolean);
      lines.forEach(line => {
        console.log(`[JOB ${jobId || 'unknown'}] ${line}`);
      });
    });

    process.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (!text) return;

      stderr += text + '\n';
      const lines = text.split('\n').filter(Boolean);
      lines.forEach(line => {
        console.error(`[JOB ${jobId || 'unknown'}-ERROR] ${line}`);
      });
    });

    process.on('error', (error) => {
      console.error(`[JOB ${jobId || 'unknown'}-ERROR] Process error:`, error);
      reject(new Error(`Process failed to start: ${error.message}`));
    });

    process.on('close', (code) => {
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

  await runPythonProcess(args, projectRoot);

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

