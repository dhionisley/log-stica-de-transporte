import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextService } from './request-context.service';
import { StructuredLogger } from './structured-logger.service';
import { TracingService } from './tracing.service';

@Global()
@Module({
  providers: [RequestContextService, RequestContextMiddleware, StructuredLogger, TracingService],
  exports: [RequestContextService, StructuredLogger, TracingService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
