import { Module } from '@nestjs/common';
import { NatsClientModule } from '@agent-workflow/nats-client';
import { PrismaModule } from '@agent-workflow/prisma-client';
import { RuntimeService } from './runtime.service';
import { RuntimeHandler } from './runtime.handler';
import { TokenResolverService } from './token-resolver.service';
import { GmailReadAdapter } from './adapters/gmail-read.adapter';
import { ReceiptFilterAdapter } from './adapters/receipt-filter.adapter';
import { GdriveUploadAdapter } from './adapters/gdrive-upload.adapter';

@Module({
  imports: [
    PrismaModule,
    NatsClientModule.forRoot({
      servers: [process.env.NATS_URL || 'nats://localhost:4222'],
    }),
  ],
  providers: [
    RuntimeService,
    RuntimeHandler,
    TokenResolverService,
    GmailReadAdapter,
    ReceiptFilterAdapter,
    GdriveUploadAdapter,
  ],
})
export class AppModule {}
