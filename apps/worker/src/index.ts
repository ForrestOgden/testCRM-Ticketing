const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);

console.log(JSON.stringify({
  level: "info",
  service: "worker",
  message: "MSP CRM worker started",
  pollIntervalMs,
}));

setInterval(() => {
  // Phase 1: claim durable jobs and unpublished outbox events here.
}, pollIntervalMs);
