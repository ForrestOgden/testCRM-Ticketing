import { runWorker } from "./job-runner.js";
import { errorMessage, log } from "./log.js";

void runWorker().catch((error) => {
  log("error", "Worker failed during startup", { error: errorMessage(error) });
  process.exitCode = 1;
});
