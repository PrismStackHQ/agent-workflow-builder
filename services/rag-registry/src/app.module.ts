import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NatsClientModule } from '@agent-workflow/nats-client';
import { PrismaModule } from '@agent-workflow/prisma-client';
import { RagService } from './rag.service';
import { RagHandler } from './rag.handler';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    NatsClientModule.forRoot({
      servers: [process.env.NATS_URL || 'nats://localhost:4222'],
    }),
  ],
  providers: [RagService, RagHandler],
})
export class AppModule {}
