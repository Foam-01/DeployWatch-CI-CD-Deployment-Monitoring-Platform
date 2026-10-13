import { Prisma } from '@prisma/client';

export function serviceDownFailureThreshold(
  config: Prisma.JsonValue,
): number | undefined {
  if (
    typeof config === "object" &&
    config !== null &&
    !Array.isArray(config) &&
    "failureThreshold" in config &&
    typeof config.failureThreshold === "number" &&
    Number.isInteger(config.failureThreshold) &&
    config.failureThreshold >= 1 &&
    config.failureThreshold <= 10
  ) {
    return config.failureThreshold;
  }
  return undefined;
}
