// Serialize control-plane mutations across requests in the single application process.
let tail: Promise<unknown> = Promise.resolve();
export function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const result = tail.then(operation);
  tail = result.catch(() => undefined);
  return result;
}
