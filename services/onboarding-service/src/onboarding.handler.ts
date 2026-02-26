import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { NatsService } from '@agent-workflow/nats-client';

@Injectable()
export class OnboardingHandler implements OnModuleInit {
  private readonly logger = new Logger(OnboardingHandler.name);

  constructor(private readonly nats: NatsService) {}

  async onModuleInit() {
    this.logger.log('Onboarding handler initialized');
    // Onboarding service is primarily a producer.
    // It listens for nothing in MVP — the gateway calls the service directly.
  }
}
