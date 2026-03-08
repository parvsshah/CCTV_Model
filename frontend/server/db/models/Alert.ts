import mongoose, { Schema, Document } from "mongoose";

export interface IAlert extends Document {
  jobId: mongoose.Types.ObjectId;
  level: "low" | "medium" | "high";
  message: string;
  peopleCount: number;
  zone?: string;
  frameIndex?: number;
  framePath?: string;
  triggeredAt: Date;
}

const AlertSchema = new Schema<IAlert>({
  jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
  level: { type: String, enum: ["low", "medium", "high"], required: true },
  message: { type: String, required: true },
  peopleCount: { type: Number, required: true },
  zone: { type: String },
  frameIndex: { type: Number },
  framePath: { type: String },
  triggeredAt: { type: Date, default: Date.now },
});

AlertSchema.index({ jobId: 1 });
AlertSchema.index({ triggeredAt: -1 });
AlertSchema.index({ level: 1 });

const Alert = mongoose.model<IAlert>("Alert", AlertSchema);
export default Alert;
