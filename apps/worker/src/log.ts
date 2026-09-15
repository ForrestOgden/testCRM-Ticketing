export type LogLevel = "debug" | "info" | "warn" | "error";

export function log(level: LogLevel, message: string, data: Record<string, unknown> = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: "worker",
    message,
    ...data,
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
