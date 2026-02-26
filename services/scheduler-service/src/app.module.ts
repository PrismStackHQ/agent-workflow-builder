import { Module } from '@nestjs/common';
import { NatsClientModule } from '@agent-workflow/nats-client';
import { PrismaModule } from '@agent-workflow/prisma-client';
import { SchedulerHandler } from './scheduler.handler';
import { K8sClientService } from './k8s/k8s-client.service';
import { CronJobBuilderService } from './k8s/cronjob-builder.service';
import { NamespaceProvisionerService } from './k8s/namespace-provisioner.service';

@Module({
  imports: [
    PrismaModule,
    NatsClientModule.forRoot({
      servers: [process.env.NATS_URL || 'nats://localhost:4222'],
    }),
  ],
  providers: [
    SchedulerHandler,
    K8sClientService,
    CronJobBuilderService,
    NamespaceProvisionerService,
  ],
})
export class AppModule {}
