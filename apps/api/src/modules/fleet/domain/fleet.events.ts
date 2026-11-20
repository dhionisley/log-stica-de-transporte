import type { JsonValue } from '../../outbox/application/messaging.types';

export function toIntegrationPayload<T extends Record<string, unknown>>(data: T): JsonValue {
  return data as unknown as JsonValue;
}
