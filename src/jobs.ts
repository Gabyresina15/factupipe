import { JobModel } from "./models/Job.js";
import { InvoiceModel } from "./models/Invoice.js";
import { ingestFile } from "./pipeline.js";

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

export async function recoverStaleJobs() {
  await JobModel.updateMany(
    { state: "running" },
    { state: "failed", error: "proceso reiniciado", finishedAt: new Date() }
  );
}

async function runJob(jobId: string) {
  const job = await JobModel.findById(jobId);
  if (!job || job.state === "done") return job;

  job.state = "running";
  job.startedAt = new Date();
  await job.save();

  try {
    const result = await Promise.race([
      ingestFile(job.pathOrigen),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)
      ),
    ]);
    const invoice = result.doc;
    const alreadyDone = !result.created && invoice.status === "complete";
    job.state = "done";
    job.skipped = alreadyDone;
    job.invoiceId = invoice._id;
    job.contentHash = invoice.contentHash;
    job.finishedAt = new Date();
    await job.save();
    return job;
  } catch (e) {
    job.state = "failed";
    job.error = e instanceof Error ? e.message : String(e);
    job.finishedAt = new Date();
    await job.save();
    return job;
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
