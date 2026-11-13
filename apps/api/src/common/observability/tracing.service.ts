import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { propagation, trace, Tracer } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

@Injectable()
export class TracingService implements OnApplicationShutdown {
  private readonly provider: NodeTracerProvider;
  private readonly tracer: Tracer;

  constructor(config: ConfigService) {
    const serviceName = config.get<string>('OTEL_SERVICE_NAME') ?? 'transport-api';
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME || 'service.name']: serviceName,
    });

    this.provider = new NodeTracerProvider({ resource });
    this.provider.register();
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    this.tracer = trace.getTracer(serviceName);
  }

  getTracer(): Tracer {
    return this.tracer;
  }

  getProvider(): NodeTracerProvider {
    return this.provider;
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.provider.shutdown();
    } catch {
      // Encerramento silencioso de recursos em shutdown
    }
  }
}

