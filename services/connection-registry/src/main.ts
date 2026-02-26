import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('ConnectionRegistry');
  const port = process.env.CONNECTION_REGISTRY_PORT || 3011;
  await app.listen(port);
  logger.log(`Connection Registry running on port ${port}`);
}
bootstrap();
