import mongoose, { Schema, Document } from "mongoose";

export interface IResult extends Document {
  jobId: mongoose.Types.ObjectId;
  csvFileId?: string;
  predictedCount?: number;
  predictionStats?: {
    mae: number;
    rmse: number;
    historicalPoints: number;
    futureSteps: number;
  };
  plotPath?: string;
  generatedAt: Date;
}

const ResultSchema = new Schema<IResult>({
  jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
  csvFileId: { type: String },
  predictedCount: { type: Number },
  predictionStats: {
    mae: { type: Number },
    rmse: { type: Number },
    historicalPoints: { type: Number },
    futureSteps: { type: Number },
  },
  plotPath: { type: String },
  generatedAt: { type: Date, default: Date.now },
});

ResultSchema.index({ jobId: 1 });

const Result = mongoose.model<IResult>("Result", ResultSchema);
export default Result;
