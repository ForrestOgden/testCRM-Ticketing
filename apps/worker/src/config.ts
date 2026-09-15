function positiveInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

export const workerConfig = {
  instanceId: process.env.WORKER_INSTANCE_ID ?? `worker-${process.pid}`,
  pollIntervalMs: positiveInt("WORKER_POLL_INTERVAL_MS", 5000),
  batchSize: positiveInt("WORKER_BATCH_SIZE", 10),
  staleLockMinutes: positiveInt("WORKER_STALE_LOCK_MINUTES", 15),
  dattoSyncMinutes: positiveInt("DATTO_SYNC_MINUTES", 15),
  graphPollMinutes: positiveInt("GRAPH_POLL_MINUTES", 5),
};
