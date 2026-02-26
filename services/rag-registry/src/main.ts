import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('RagRegistry');
  const port = process.env.RAG_REGISTRY_PORT || 3012;
  await app.listen(port);
  logger.log(`RAG Registry running on port ${port}`);
}
bootstrap();
