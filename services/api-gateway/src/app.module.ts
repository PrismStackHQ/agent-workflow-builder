import { Module } from '@nestjs/common';
import { NatsClientModule } from '@agent-workflow/nats-client';
import { PrismaModule } from '@agent-workflow/prisma-client';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ConnectionsModule } from './connections/connections.module';
import { RagModule } from './rag/rag.module';
import { AgentsModule } from './agents/agents.module';
import { AuthGatewayModule } from './auth/auth.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { ToolsModule } from './tools/tools.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    PrismaModule,
    NatsClientModule.forRoot({
      servers: [process.env.NATS_URL || 'nats://localhost:4222'],
    }),
    OnboardingModule,
    ConnectionsModule,
    RagModule,
    AgentsModule,
    AuthGatewayModule,
    WorkspacesModule,
    ToolsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
