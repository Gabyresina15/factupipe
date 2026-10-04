import { JobModel, type JobErrorCode } from "./models/Job.js";
import { InvoiceModel } from "./models/Invoice.js";
import { ingestFile } from "./pipeline.js";
import { logInvoice, newTimings } from "./metrics.js";

const TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 120_000);
let chain: Promise<unknown> = Promise.resolve();

function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

class JobError extends Error {
  constructor(public code: JobErrorCode, message: string) {
    super(message);
  }
}

export async function recoverStaleJobs() {
  await JobModel.updateMany(
    { state: "running" },
    {
      state: "failed",
      errorCode: "process_restarted",
      error: "proceso reiniciado",
      finishedAt: new Date(),
    }
  );
  // Los queued no llegaron a correr: se retoman en orden de llegada.
  const queued = await JobModel.find({ state: "queued" }).sort({ createdAt: 1 }).select("_id").lean();
  for (const j of queued) void exclusive(() => runJob(String(j._id)));
  return { resumed: queued.length };
}

async function runJob(jobId: string) {
  const job = await JobModel.findById(jobId);
  if (!job || job.state !== "queued") return job;

  job.state = "running";
  job.startedAt = new Date();
  await job.save();

  const abort = new AbortController();
  const timings = newTimings();
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      ingestFile(job.pathOrigen, { signal: abort.signal, jobId: String(job._id), timings }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new JobError("timeout", `timeout tras ${TIMEOUT_MS} ms`));
        }, TIMEOUT_MS);
      }),
    ]);
    const invoice = result.doc;
    job.state = "done";
    job.skipped = result.skipped;
    job.invoiceId = invoice._id;
    job.contentHash = invoice.contentHash;
    job.finishedAt = new Date();
    await job.save();
    return job;
  } catch (e) {
    job.state = "failed";
    job.errorCode = e instanceof JobError ? e.code : "ingest_error";
    if (job.errorCode === "timeout") {
      logInvoice({
        jobId: String(job._id),
        outcome: "failed",
        errorCode: "timeout",
        timings,
        totalMs: Date.now() - job.startedAt!.getTime(),
        fields: {},
      });
    }
    job.error = e instanceof Error ? e.message : String(e);
    job.finishedAt = new Date();
    await job.save();
    return job;
  } finally {
    clearTimeout(timer);
  }
}

export async function enqueueIngest(filePath: string) {
  const job = await JobModel.create({ pathOrigen: filePath, state: "queued" });
  const finished = await exclusive(() => runJob(String(job._id)));
  const invoice = finished?.invoiceId
    ? await InvoiceModel.findById(finished.invoiceId).lean()
    : null;
  return { job: finished, invoice };
}
