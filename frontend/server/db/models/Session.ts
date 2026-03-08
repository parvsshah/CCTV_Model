import mongoose, { Schema, Document } from "mongoose";

export interface ISession extends Document {
  userId: mongoose.Types.ObjectId;
  token: string;
  refreshToken?: string;
  ipAddress?: string;
  userAgent?: string;
  loginAt: Date;
  logoutAt?: Date;
  isActive: boolean;
}

const SessionSchema = new Schema<ISession>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  token: { type: String, required: true },
  refreshToken: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String },
  loginAt: { type: Date, default: Date.now },
  logoutAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
});

SessionSchema.index({ token: 1 });
SessionSchema.index({ userId: 1, isActive: 1 });

const Session = mongoose.model<ISession>("Session", SessionSchema);
export default Session;
