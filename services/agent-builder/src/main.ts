import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('AgentBuilder');
  const port = process.env.AGENT_BUILDER_PORT || 3013;
  await app.listen(port);
  logger.log(`Agent Builder running on port ${port}`);
}
bootstrap();
