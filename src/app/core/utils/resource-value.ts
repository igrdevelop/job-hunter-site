/** The minimal shape of Angular's `Resource<T>`/`ResourceRef<T>` this helper needs. */
interface ResourceLike<T> {
  hasValue(): boolean;
  value(): T;
}

/**
 * Reads a `resource()`'s value without throwing while it's in an error state —
 * `resource.value()` alone rethrows the load error, so a `computed()` reading
 * it directly crashes instead of falling through to an empty/error UI state.
 */
export function safeResourceValue<T>(resource: ResourceLike<T>): T | undefined {
  return resource.hasValue() ? resource.value() : undefined;
}
