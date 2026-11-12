export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface IntegrationEvent {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId?: string;
  causationId?: string;
  payload: JsonValue;
  occurredAt: Date;
}

// Ponto de extensao intencional: eventos pendentes podem ganhar campos de entrega no futuro.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PendingOutboxEvent extends IntegrationEvent {}

export interface InboxMessage {
  tenantId: string;
  consumer: string;
  messageId: string;
}

export interface InboxProcessingResult<T extends JsonValue> {
  applied: boolean;
  result: T;
}
