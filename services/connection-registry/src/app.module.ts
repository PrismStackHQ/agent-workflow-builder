import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NatsClientModule } from '@agent-workflow/nats-client';
import { PrismaModule } from '@agent-workflow/prisma-client';
import { ConnectionService } from './connection.service';
import { ConnectionHandler } from './connection.handler';
import { TokenFetcherService } from './token-fetcher.service';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    NatsClientModule.forRoot({
      servers: [process.env.NATS_URL || 'nats://localhost:4222'],
    }),
  ],
  providers: [ConnectionService, ConnectionHandler, TokenFetcherService],
})
export class AppModule {}
