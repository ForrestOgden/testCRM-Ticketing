import { hydrateIntegrationEnvironment, startIntegrationEnvironmentRefresh } from "./integration-config.js";
import { runWorker } from "./job-runner.js";
import { errorMessage, log } from "./log.js";

async function start() {
  try {
    await hydrateIntegrationEnvironment();
    startIntegrationEnvironmentRefresh();
  } catch (error) {
    log("warn", "Worker started without database-backed integration configuration", { error: errorMessage(error) });
  }
  await runWorker();
}

void start().catch((error) => {
  log("error", "Worker failed during startup", { error: errorMessage(error) });
  process.exitCode = 1;
});
