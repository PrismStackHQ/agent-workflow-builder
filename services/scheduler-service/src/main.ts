import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('SchedulerService');
  const port = process.env.SCHEDULER_PORT || 3014;
  await app.listen(port);
  logger.log(`Scheduler Service running on port ${port}`);
}
bootstrap();
