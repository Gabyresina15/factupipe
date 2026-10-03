import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    pathOrigen: { type: String, required: true },
    contentHash: String,
    state: { type: String, enum: ["queued", "running", "done", "failed"], required: true },
    error: String,
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
    skipped: { type: Boolean, default: false },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true }
);

export const JobModel = mongoose.model("Job", schema);
