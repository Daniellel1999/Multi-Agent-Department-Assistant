export function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown error.";
  }

  const status = getErrorField(error, "status");
  const code = getErrorField(error, "code");
  const details = [status ? `status ${status}` : undefined, code ? `code ${code}` : undefined]
    .filter(Boolean)
    .join(", ");

  return details ? `${details}: ${error.message}` : error.message;
}

function getErrorField(error: Error, field: "status" | "code"): string | undefined {
  const value = (error as Error & Record<string, unknown>)[field];
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return undefined;
}
