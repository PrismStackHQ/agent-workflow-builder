import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('WebSocketService');

  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableCors({ origin: '*' });

  const port = process.env.WEBSOCKET_PORT || 3002;
  await app.listen(port);
  logger.log(`WebSocket service running on port ${port}`);
}
bootstrap();
