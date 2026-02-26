import { Module } from '@nestjs/common';
import { NatsClientModule } from '@agent-workflow/nats-client';
import { PrismaModule } from '@agent-workflow/prisma-client';
import { WsGatewayService } from './ws.gateway';
import { WsService } from './ws.service';
import { WsHandler } from './ws.handler';

@Module({
  imports: [
    PrismaModule,
    NatsClientModule.forRoot({
      servers: [process.env.NATS_URL || 'nats://localhost:4222'],
    }),
  ],
  providers: [WsGatewayService, WsService, WsHandler],
})
export class AppModule {}
