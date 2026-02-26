import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { RuntimeService } from './runtime.service';

async function bootstrap() {
  const logger = new Logger('AgentRuntime');
  const agentId = process.env.AGENT_ID;
  const orgId = process.env.ORG_ID;

  if (agentId && orgId) {
    // Running as a K8s Job — execute once and exit
    logger.log(`Running agent ${agentId} for org ${orgId}`);
    const app = await NestFactory.createApplicationContext(AppModule);
    const runtime = app.get(RuntimeService);
    try {
      await runtime.executeRun(agentId, orgId);
    } catch (err) {
      logger.error(`Run failed: ${err}`);
      process.exit(1);
    }
    await app.close();
    process.exit(0);
  } else {
    // Running as a long-lived service (dev mode / listens for NATS triggers)
    const app = await NestFactory.create(AppModule);
    const port = process.env.AGENT_RUNTIME_PORT || 3015;
    await app.listen(port);
    logger.log(`Agent Runtime (dev mode) running on port ${port}`);
  }
}
bootstrap();
