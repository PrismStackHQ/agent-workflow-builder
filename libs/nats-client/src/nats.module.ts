import { DynamicModule, Module } from '@nestjs/common';
import { NatsService, NatsClientOptions } from './nats.service';

@Module({})
export class NatsClientModule {
  static forRoot(options: NatsClientOptions): DynamicModule {
    return {
      module: NatsClientModule,
      providers: [
        { provide: 'NATS_OPTIONS', useValue: options },
        NatsService,
      ],
      exports: [NatsService],
      global: true,
    };
  }
}
