import { Module } from '@nestjs/common';
import { NatsClientModule } from '@agent-workflow/nats-client';
import { PrismaModule } from '@agent-workflow/prisma-client';
import { NlParserService } from './builder/nl-parser.service';
import { TemplateMatcherService } from './builder/template-matcher.service';
import { AgentAssemblerService } from './builder/agent-assembler.service';
import { LlmPlannerService } from './builder/llm-planner.service';
import { BuilderHandler } from './builder.handler';

@Module({
  imports: [
    PrismaModule,
    NatsClientModule.forRoot({
      servers: [process.env.NATS_URL || 'nats://localhost:4222'],
    }),
  ],
  providers: [NlParserService, TemplateMatcherService, AgentAssemblerService, LlmPlannerService, BuilderHandler],
})
export class AppModule {}
