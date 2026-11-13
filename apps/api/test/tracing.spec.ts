import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'node:events';
import { RequestContextMiddleware } from '../src/common/observability/request-context.middleware';
import { RequestContextService } from '../src/common/observability/request-context.service';
import { StructuredLogger } from '../src/common/observability/structured-logger.service';
import { TracingService } from '../src/common/observability/tracing.service';

describe('Tracing Baseline (OpenTelemetry)', () => {
  let tracingService: TracingService;
  let requestContext: RequestContextService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = new ConfigService({ OTEL_SERVICE_NAME: 'test-transport-api' });
    tracingService = new TracingService(configService);
    requestContext = new RequestContextService();
  });

  afterEach(async () => {
    await tracingService.onApplicationShutdown();
  });

  it('registers TracerProvider with the configured service name', () => {
    const tracer = tracingService.getTracer();
    expect(tracer).toBeDefined();

    const provider = tracingService.getProvider();
    expect(provider).toBeDefined();
    // Verifica que resource possui o nome do serviço
    const resource = (provider as any)._resource;
    expect(resource.attributes['service.name']).toBe('test-transport-api');
  });

  it('extracts and continues an incoming valid W3C traceparent', () => {
    const middleware = new RequestContextMiddleware(requestContext, tracingService);
    const incomingTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const incomingParentId = '00f067aa0ba902b7';
    const traceparent = `00-${incomingTraceId}-${incomingParentId}-01`;

    const request = {
      method: 'GET',
      headers: { traceparent },
    };
    const response = {
      setHeader: jest.fn(),
      on: jest.fn(),
    };

    let observedTraceId: string | undefined;

    middleware.use(request, response as any, () => {
      observedTraceId = requestContext.get()?.traceId;
    });

    expect(observedTraceId).toBe(incomingTraceId);
  });

  it('generates a new root trace ID when traceparent is absent', () => {
    const middleware = new RequestContextMiddleware(requestContext, tracingService);
    const request = {
      method: 'POST',
      headers: {},
    };
    const response = {
      setHeader: jest.fn(),
      on: jest.fn(),
    };

    let observedTraceId: string | undefined;

    middleware.use(request, response as any, () => {
      observedTraceId = requestContext.get()?.traceId;
    });

    expect(observedTraceId).toBeDefined();
    expect(observedTraceId).toMatch(/^[0-9a-f]{32}$/);
    expect(observedTraceId).not.toBe('00000000000000000000000000000000');
  });

  it('generates a new root trace ID when traceparent is malformed', () => {
    const middleware = new RequestContextMiddleware(requestContext, tracingService);
    const request = {
      method: 'GET',
      headers: { traceparent: 'invalid-traceparent-format' },
    };
    const response = {
      setHeader: jest.fn(),
      on: jest.fn(),
    };

    let observedTraceId: string | undefined;

    middleware.use(request, response as any, () => {
      observedTraceId = requestContext.get()?.traceId;
    });

    expect(observedTraceId).toBeDefined();
    expect(observedTraceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('correlates trace_id in structured logs during the request execution', () => {
    const middleware = new RequestContextMiddleware(requestContext, tracingService);
    const logger = new StructuredLogger(configService, requestContext);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const incomingTraceId = '1234567890abcdef1234567890abcdef';
    const traceparent = `00-${incomingTraceId}-0000000000000001-01`;

    const request = {
      method: 'GET',
      headers: { 'x-request-id': 'req-xyz', traceparent },
    };
    const response = {
      setHeader: jest.fn(),
      on: jest.fn(),
    };

    middleware.use(request, response as any, () => {
      logger.log('Processing operational request');
    });

    expect(logSpy).toHaveBeenCalled();
    const emitted = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(emitted.service).toBe('test-transport-api');
    expect(emitted.request_id).toBe('req-xyz');
    expect(emitted.trace_id).toBe(incomingTraceId);
    expect(emitted.message).toBe('Processing operational request');

    logSpy.mockRestore();
  });

  it('ends the request span when response finish event fires', () => {
    const middleware = new RequestContextMiddleware(requestContext, tracingService);

    class MockResponse extends EventEmitter {
      setHeader = jest.fn();
    }
    const response = new MockResponse();

    let executed = false;
    middleware.use({ method: 'GET', headers: {} }, response as any, () => {
      executed = true;
    });

    expect(executed).toBe(true);
    // Emite o evento finish
    expect(() => response.emit('finish')).not.toThrow();
  });

  it('shuts down cleanly on application shutdown without errors', async () => {
    await expect(tracingService.onApplicationShutdown()).resolves.toBeUndefined();
  });
});
