import mongoose from "mongoose";

export const JOB_ERROR_CODES = ["timeout", "process_restarted", "ingest_error"] as const;
export type JobErrorCode = (typeof JOB_ERROR_CODES)[number];

const schema = new mongoose.Schema(
  {
    pathOrigen: { type: String, required: true },
    contentHash: String,
    state: { type: String, enum: ["queued", "running", "done", "failed"], required: true },
    errorCode: { type: String, enum: JOB_ERROR_CODES },
    error: String,
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
    skipped: { type: Boolean, default: false },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true }
);

export const JobModel = mongoose.model("Job", schema);
