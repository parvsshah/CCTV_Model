// frontend/server/routes/detection.ts
import { Router } from "express";
import multer from "multer";
import path from "path";
import { nanoid } from "nanoid";
import fs from "fs/promises";
import {
  DetectionConfig,
  DetectionJobListResponse,
  DetectionPredictionResponse,
  DetectionStartResponse,
  DetectionSourceType,
} from "@shared/api";
import {
  createDetectionJob,
  detectionPaths,
  getDetectionJob,
  listDetectionJobs,
  runPredictionForJob,
} from "../jobs/detection-jobs";
import { detectFileExtension } from "../utils/file-utils";

// Configure multer to preserve file extensions
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, detectionPaths.uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = nanoid();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueId}${ext}`);
  }
});

// File filter to check extensions
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = [
    '.mp4', '.avi', '.mov', '.mkv', '.webm',
    '.wmv', '.flv', '.m4v', '.mpg', '.mpeg'
  ];

  if (allowedExtensions.includes(ext)) {
    return cb(null, true);
  }
  cb(new Error(`Invalid file type. Only ${allowedExtensions.join(', ')} are allowed.`));
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB limit
  }
});

const router = Router();

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return !isNaN(num) ? num : fallback;
  }
  return fallback;
}

function parseConfig(body: Record<string, unknown>): DetectionConfig {
  return {
    frameSkip: Math.max(1, Math.round(parseNumber(body.frameSkip, 1))),
    confidence: Math.min(100, Math.max(0, parseNumber(body.confidence, 70))),
    baseMax: Math.max(1, Math.round(parseNumber(body.baseMax, 100))),
    maxFrames: Math.max(0, Math.round(parseNumber(body.maxFrames, 0))),
  };
}

async function ensureFilePermissions(filePath: string): Promise<void> {
  try {
    await fs.chmod(filePath, 0o666);
  } catch (error) {
    console.error(`Failed to set permissions for ${filePath}:`, error);
  }
}

router.post(
  "/api/detection/start",
  upload.single("file"),
  async (req, res) => {
    try {
      const file = req.file;
      const sourceType = (req.body.sourceType as DetectionSourceType) || (file ? "upload" : "stream");
      const streamUrl = req.body.streamUrl as string | undefined;

      if (sourceType === "upload" && !file) {
        return res.status(400).json({ message: "Video file is required for upload jobs" });
      }

      // Verify the uploaded file
      if (file) {
        // Check if the file has a valid extension
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.wmv', '.flv', '.m4v', '.mpg', '.mpeg'];

        if (!ext || !allowedExtensions.includes(ext)) {
          // If no extension or invalid extension, try to determine it from the file
          const detectedExt = await detectFileExtension(file.path);
          if (detectedExt) {
            const newPath = `${file.path}${detectedExt}`;
            await fs.rename(file.path, newPath);
            file.path = newPath;
            file.originalname = `${path.basename(file.originalname)}${detectedExt}`;
          } else {
            // Clean up the invalid file
            await fs.unlink(file.path).catch(console.error);
            return res.status(400).json({
              message: `Invalid file type. Allowed types: ${allowedExtensions.join(', ')}`
            });
          }
        }

        // Verify file is not empty
        const stats = await fs.stat(file.path);
        if (stats.size === 0) {
          await fs.unlink(file.path).catch(console.error);
          return res.status(400).json({ message: "Uploaded file is empty" });
        }

        // Ensure proper permissions
        await ensureFilePermissions(file.path);
      }

      const config = parseConfig(req.body);
      const sourcePath = sourceType === "upload" && file ? file.path : (streamUrl as string);

      const job = await createDetectionJob({
        sourceType,
        sourcePath,
        sourceName: file?.originalname || streamUrl || "Unknown Source",
        config,
        notes: req.body.notes as string | undefined,
      });

      const response: DetectionStartResponse = { job };
      return res.status(201).json(response);
    } catch (error) {
      console.error("[detection:start] Failed to create job", error);

      // Clean up uploaded file if there was an error
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(console.error);
      }

      const message = error instanceof Error ? error.message : "Failed to start detection job";
      return res.status(500).json({ message });
    }
  }
);

router.get("/api/detection/jobs", (_req, res) => {
  const jobs = listDetectionJobs();
  const response: DetectionJobListResponse = { jobs };
  res.json(response);
});

// Get only stream jobs (for Live page)
router.get("/api/detection/jobs/streams", (_req, res) => {
  const allJobs = listDetectionJobs();
  const streamJobs = allJobs.filter(job => job.sourceType === "stream");
  const response: DetectionJobListResponse = { jobs: streamJobs };
  res.json(response);
});

router.get("/api/detection/jobs/:id", (req, res) => {
  const job = getDetectionJob(req.params.id);
  if (!job) {
    return res.status(404).json({ message: "Job not found" });
  }
  res.json({ job });
});

router.post("/api/detection/jobs/:id/predict", async (req, res) => {
  const jobId = req.params.id;
  const future = parseNumber((req.body as any)?.future ?? 50, 50);
  try {
    const prediction = await runPredictionForJob(jobId, future);
    const response: DetectionPredictionResponse = prediction;
    res.json(response);
  } catch (error) {
    console.error("[detection:predict] Failed", error);
    const message = error instanceof Error ? error.message : "Failed to generate prediction";
    res.status(400).json({ message });
  }
});

// Serve live stream frames
router.get("/api/detection/jobs/:id/stream", async (req, res) => {
  const jobId = req.params.id;
  try {
    const job = getDetectionJob(jobId);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Path to the stream frame
    const streamFramePath = path.join(detectionPaths.processedDir, jobId, "stream", "latest.jpg");

    // Check if frame exists
    try {
      await fs.access(streamFramePath);

      // Set headers for no-cache to ensure fresh frames
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Content-Type", "image/jpeg");

      // Send the frame
      res.sendFile(streamFramePath);
    } catch (error) {
      // Frame doesn't exist yet, send placeholder or 404
      res.status(404).json({ message: "Stream frame not available yet" });
    }
  } catch (error) {
    console.error("[detection:stream] Failed", error);
    const message = error instanceof Error ? error.message : "Failed to get stream frame";
    res.status(500).json({ message });
  }
});

// Terminate a running job
router.post("/api/detection/jobs/:id/terminate", async (req, res) => {
  const jobId = req.params.id;
  try {
    const job = getDetectionJob(jobId);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (job.status !== "running") {
      return res.status(400).json({ message: "Job is not running" });
    }

    // Import the terminate function
    const { terminateDetectionJob } = await import("../jobs/detection-jobs.js");
    await terminateDetectionJob(jobId);

    res.json({ message: "Job terminated successfully" });
  } catch (error) {
    console.error("[detection:terminate] Failed", error);
    const message = error instanceof Error ? error.message : "Failed to terminate job";
    res.status(500).json({ message });
  }
});

export default router;