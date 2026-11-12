import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestContextService } from './request-context.service';

const sensitiveKeys = new Set([
  'authorization', 'cookie', 'setcookie', 'password', 'passwd', 'token',
  'accesstoken', 'refreshtoken', 'secret', 'apikey', 'databaseurl', 'redisurl',
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[-_.]/g, '');
}

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeys.has(normalizedKey(key)) ? '[REDACTED]' : redact(item, seen),
    ]),
  );
}

@Injectable()
export class StructuredLogger implements LoggerService {
  private readonly serviceName: string;

  constructor(config: ConfigService, private readonly requestContext: RequestContextService) {
    this.serviceName = config.get<string>('OTEL_SERVICE_NAME') ?? 'transport-api';
  }

  log(message: unknown, ...optionalParams: unknown[]): void { this.write('info', message, optionalParams); }
  warn(message: unknown, ...optionalParams: unknown[]): void { this.write('warn', message, optionalParams); }
  error(message: unknown, ...optionalParams: unknown[]): void { this.write('error', message, optionalParams); }
  debug(message: unknown, ...optionalParams: unknown[]): void { this.write('debug', message, optionalParams); }
  verbose(message: unknown, ...optionalParams: unknown[]): void { this.write('verbose', message, optionalParams); }
  fatal(message: unknown, ...optionalParams: unknown[]): void { this.write('fatal', message, optionalParams); }

  private write(level: string, message: unknown, optionalParams: unknown[]): void {
    const current = this.requestContext.get();
    const contextName = optionalParams.length === 1 && typeof optionalParams[0] === 'string'
      ? optionalParams[0]
      : undefined;
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message: typeof message === 'string' ? message : 'structured_log',
      ...(contextName ? { context: contextName } : {}),
      ...(current?.requestId ? { request_id: current.requestId } : {}),
      ...(current?.traceId ? { trace_id: current.traceId } : {}),
      ...(typeof message === 'object' && message !== null ? { data: redact(message) } : {}),
      ...(optionalParams.length > 0 && !contextName ? { details: redact(optionalParams) } : {}),
    };
    const serialized = JSON.stringify(record);
    if (level === 'error' || level === 'fatal') console.error(serialized);
    else if (level === 'warn') console.warn(serialized);
    else console.log(serialized);
  }
}
