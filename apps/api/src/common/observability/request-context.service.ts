import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestMetadata {
  requestId: string;
  traceId?: string;
  tenantId?: string;
  userId?: string;
  sessionId?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestMetadata>();

  run<T>(metadata: RequestMetadata, callback: () => T): T {
    return this.storage.run(metadata, callback);
  }

  get(): RequestMetadata | undefined {
    return this.storage.getStore();
  }
}
