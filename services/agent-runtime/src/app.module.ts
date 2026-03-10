import { Module } from '@nestjs/common';
import { NatsClientModule } from '@agent-workflow/nats-client';
import { PrismaModule } from '@agent-workflow/prisma-client';
import { IntegrationProviderModule } from '@agent-workflow/integration-provider';
import { RuntimeService } from './runtime.service';
import { RuntimeHandler } from './runtime.handler';
import { ReceiptFilterAdapter } from './adapters/receipt-filter.adapter';
import { LlmTransformAdapter } from './adapters/llm-transform.adapter';
import { ExpressionEngine } from './expression-engine.service';

@Module({
  imports: [
    PrismaModule,
    NatsClientModule.forRoot({
      servers: [process.env.NATS_URL || 'nats://localhost:4222'],
    }),
    IntegrationProviderModule,
  ],
  providers: [
    RuntimeService,
    RuntimeHandler,
    ReceiptFilterAdapter,
    LlmTransformAdapter,
    ExpressionEngine,
  ],
})
export class AppModule {}
