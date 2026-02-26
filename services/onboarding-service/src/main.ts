import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('OnboardingService');

  const port = process.env.ONBOARDING_SERVICE_PORT || 3010;
  await app.listen(port);
  logger.log(`Onboarding service running on port ${port}`);
}
bootstrap();
