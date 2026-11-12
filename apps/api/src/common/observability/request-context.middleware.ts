import { Injectable, NestMiddleware } from '@nestjs/common';
import { context, trace } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';
import { RequestContextService } from './request-context.service';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(request: RequestLike, response: ResponseLike, next: () => void): void {
    const supplied = request.headers['x-request-id'];
    const candidate = Array.isArray(supplied) ? supplied[0] : supplied;
    const requestId = candidate && requestIdPattern.test(candidate) ? candidate : randomUUID();
    const spanContext = trace.getSpan(context.active())?.spanContext();
    const traceId = spanContext?.traceId && spanContext.traceId !== '00000000000000000000000000000000'
      ? spanContext.traceId
      : undefined;

    response.setHeader('X-Request-Id', requestId);
    this.requestContext.run({ requestId, traceId }, next);
  }
}
