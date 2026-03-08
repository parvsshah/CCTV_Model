import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: "admin" | "analyst" | "viewer";
  avatarUrl?: string;
  contacts?: {
    phone?: string;
    alternateEmail?: string;
  };
  demographics?: {
    dob?: Date;
    gender?: string;
    location?: string;
    organization?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "analyst", "viewer"], default: "viewer" },
    avatarUrl: { type: String },
    contacts: {
      phone: { type: String },
      alternateEmail: { type: String },
    },
    demographics: {
      dob: { type: Date },
      gender: { type: String },
      location: { type: String },
      organization: { type: String },
    },
  },
  { timestamps: true },
);

UserSchema.index({ email: 1 }, { unique: true });

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

const User = mongoose.model<IUser>("User", UserSchema);
export default User;
