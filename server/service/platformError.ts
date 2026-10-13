export class PlatformError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export function assertPlatform(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new PlatformError(status, message);
}
