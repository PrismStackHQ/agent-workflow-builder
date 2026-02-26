import { Module } from '@nestjs/common';
import { RagController } from './rag.controller';

@Module({
  controllers: [RagController],
})
export class RagModule {}
