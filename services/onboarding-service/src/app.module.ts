import { Module } from '@nestjs/common';
import { NatsClientModule } from '@agent-workflow/nats-client';
import { PrismaModule } from '@agent-workflow/prisma-client';
import { OnboardingService } from './onboarding.service';
import { OnboardingHandler } from './onboarding.handler';

@Module({
  imports: [
    PrismaModule,
    NatsClientModule.forRoot({
      servers: [process.env.NATS_URL || 'nats://localhost:4222'],
    }),
  ],
  providers: [OnboardingService, OnboardingHandler],
})
export class AppModule {}
