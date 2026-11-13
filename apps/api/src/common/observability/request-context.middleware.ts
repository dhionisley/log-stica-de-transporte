import { Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { context, propagation, trace } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';
import { RequestContextService } from './request-context.service';
import { TracingService } from './tracing.service';

interface RequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
  on?(event: string, listener: () => void): this;
}

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContext: RequestContextService,
    @Optional() private readonly tracingService?: TracingService,
  ) {}

  use(request: RequestLike, response: ResponseLike, next: () => void): void {
    const supplied = request.headers['x-request-id'];
    const candidate = Array.isArray(supplied) ? supplied[0] : supplied;
    const requestId = candidate && requestIdPattern.test(candidate) ? candidate : randomUUID();

    response.setHeader('X-Request-Id', requestId);

    const extractedCtx = propagation.extract(context.active(), request.headers);
    const tracer = this.tracingService
      ? this.tracingService.getTracer()
      : trace.getTracer('transport-api');

    const spanName = `HTTP ${request.method ?? 'GET'}`;
    const span = tracer.startSpan(spanName, undefined, extractedCtx);
    const activeCtx = trace.setSpan(extractedCtx, span);

    const spanContext = span.spanContext();
    const traceId =
      spanContext.traceId && spanContext.traceId !== '00000000000000000000000000000000'
        ? spanContext.traceId
        : undefined;

    if (typeof response.on === 'function') {
      let ended = false;
      const endSpan = () => {
        if (!ended) {
          ended = true;
          span.end();
        }
      };
      response.on('finish', endSpan);
      response.on('close', endSpan);
    } else {
      span.end();
    }

    context.with(activeCtx, () => {
      this.requestContext.run({ requestId, traceId }, next);
    });
  }
}
