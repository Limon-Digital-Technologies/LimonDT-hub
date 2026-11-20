export function errorMessage(error, fallback = "Неизвестная ошибка.") {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object") {
    for (const key of ["message", "error", "reason"]) {
      const value = error[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      return fallback;
    }
  }
  return fallback;
}
