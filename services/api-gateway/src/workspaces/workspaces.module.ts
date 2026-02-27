import { Module } from '@nestjs/common';
import { PrismaModule } from '@agent-workflow/prisma-client';
import { AuthModule } from '@agent-workflow/auth';
import { WorkspacesController } from './workspaces.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WorkspacesController],
})
export class WorkspacesModule {}
