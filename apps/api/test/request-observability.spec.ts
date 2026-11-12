import { ConfigService } from '@nestjs/config';
import { RequestContextMiddleware } from '../src/common/observability/request-context.middleware';
import { RequestContextService } from '../src/common/observability/request-context.service';
import { redact, StructuredLogger } from '../src/common/observability/structured-logger.service';

describe('request observability', () => {
  it('keeps overlapping async request contexts isolated', async () => {
    const context = new RequestContextService();
    const values = await Promise.all([
      context.run({ requestId: 'request-a' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return context.get()?.requestId;
      }),
      context.run({ requestId: 'request-b' }, async () => {
        await Promise.resolve();
        return context.get()?.requestId;
      }),
    ]);
    expect(values).toEqual(['request-a', 'request-b']);
  });

  it('preserves a valid request ID and exposes it in the response', () => {
    const context = new RequestContextService();
    const middleware = new RequestContextMiddleware(context);
    const response = { setHeader: jest.fn() };
    let observed: string | undefined;
    middleware.use({ headers: { 'x-request-id': 'client-request_1' } }, response, () => {
      observed = context.get()?.requestId;
    });
    expect(observed).toBe('client-request_1');
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-request_1');
  });

  it('replaces an invalid request ID with a UUID', () => {
    const context = new RequestContextService();
    const middleware = new RequestContextMiddleware(context);
    const response = { setHeader: jest.fn() };
    middleware.use({ headers: { 'x-request-id': 'invalid request id' } }, response, () => undefined);
    const generated = response.setHeader.mock.calls[0][1] as string;
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('omits trace ID when no active span exists (no SDK)', () => {
    const context = new RequestContextService();
    const middleware = new RequestContextMiddleware(context);
    let traceId: string | undefined = 'unset';
    middleware.use({ headers: {} }, { setHeader: jest.fn() }, () => {
      traceId = context.get()?.traceId;
    });
    expect(traceId).toBeUndefined();
  });

  it('redacts circular references safely', () => {
    const value: Record<string, unknown> = { password: 'x' };
    value.self = value;
    expect(redact(value)).toEqual({ password: '[REDACTED]', self: '[Circular]' });
  });

  it('emits correlated JSON and redacts nested sensitive fields', () => {
    const context = new RequestContextService();
    const logger = new StructuredLogger(
      new ConfigService({ OTEL_SERVICE_NAME: 'test-api' }),
      context,
    );
    const output = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const secret = 'must-not-appear';

    context.run({ requestId: 'req-1', traceId: 'trace-1' }, () => {
      logger.log({ authorization: secret, nested: { password: secret, safe: 'visible' } });
    });

    const record = JSON.parse(output.mock.calls[0][0] as string);
    expect(record).toMatchObject({
      level: 'info', service: 'test-api', request_id: 'req-1', trace_id: 'trace-1',
      data: { authorization: '[REDACTED]', nested: { password: '[REDACTED]', safe: 'visible' } },
    });
    expect(output.mock.calls[0][0]).not.toContain(secret);
    output.mockRestore();
  });
});
