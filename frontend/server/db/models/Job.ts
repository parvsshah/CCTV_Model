import mongoose, { Schema, Document } from "mongoose";

export interface IJob extends Document {
  jobId: string;
  userId?: mongoose.Types.ObjectId;
  status: "queued" | "running" | "completed" | "failed";
  sourceType: "upload" | "stream" | "camera" | "file";
  sourceName: string;
  sourcePath: string;
  config: {
    frameSkip: number;
    confidence: number;
    baseMax: number;
    maxFrames: number;
  };
  notes?: string;
  uploadedFile?: {
    originalName: string;
    size: number;
    mimeType?: string;
    storedPath: string;
  };
  stats?: {
    totalDetections: number;
    maxPeople: number;
    averagePeople: number;
    currentMax: number;
  };
  error?: string;
  processPid?: number;
  startedAt?: Date;
  finishedAt?: Date;
}

const JobSchema = new Schema<IJob>({
  jobId: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  status: { type: String, enum: ["queued", "running", "completed", "failed"], default: "queued" },
  sourceType: { type: String, enum: ["upload", "stream", "camera", "file"], required: true },
  sourceName: { type: String, required: true },
  sourcePath: { type: String, required: true },
  config: {
    frameSkip: { type: Number, default: 1 },
    confidence: { type: Number, default: 70 },
    baseMax: { type: Number, default: 100 },
    maxFrames: { type: Number, default: 0 },
  },
  notes: { type: String },
  uploadedFile: {
    originalName: { type: String },
    size: { type: Number },
    mimeType: { type: String },
    storedPath: { type: String },
  },
  stats: {
    totalDetections: { type: Number },
    maxPeople: { type: Number },
    averagePeople: { type: Number },
    currentMax: { type: Number },
  },
  error: { type: String },
  processPid: { type: Number },
  startedAt: { type: Date },
  finishedAt: { type: Date },
});

JobSchema.index({ jobId: 1 }, { unique: true });
JobSchema.index({ userId: 1 });
JobSchema.index({ status: 1 });

const Job = mongoose.model<IJob>("Job", JobSchema);
export default Job;
