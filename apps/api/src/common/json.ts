export function toJsonValue(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)
  ) as unknown;
}
