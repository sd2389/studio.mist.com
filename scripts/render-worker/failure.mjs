/** Codes another attempt may fix (RETRYABLE_CODES in backend/app/features/render_jobs/worker.py). */
const RETRYABLE = new Set(["browser_crashed", "gpu_lost", "upload_failed", "encode_failed", "unknown"]);

/** Why a job stopped, as the worker reports it to `fail`. */
export class JobFailure extends Error {
  /** @param {string} code A FailureCode of backend/app/schemas/render_job.py. */
  constructor(code, message, { recycleBrowser = false } = {}) {
    super(message);
    this.name = "JobFailure";
    this.code = code;
    this.retryable = RETRYABLE.has(code);
    this.recycleBrowser = recycleBrowser;
  }
}
