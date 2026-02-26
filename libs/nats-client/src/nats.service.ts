import { Injectable, Inject, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import {
  connect,
  NatsConnection,
  JetStreamClient,
  JetStreamManager,
  StringCodec,
  consumerOpts,
  createInbox,
} from 'nats';
import { STREAM_NAME, STREAM_SUBJECTS } from '@agent-workflow/shared-types';

export interface NatsClientOptions {
  servers: string[];
  streamName?: string;
}

@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsService.name);
  private nc!: NatsConnection;
  private js!: JetStreamClient;
  private jsm!: JetStreamManager;
  private readonly sc = StringCodec();

  constructor(@Inject('NATS_OPTIONS') private readonly options: NatsClientOptions) {}

  async onModuleInit() {
    try {
      this.nc = await connect({ servers: this.options.servers });
      this.jsm = await this.nc.jetstreamManager();
      this.js = this.nc.jetstream();

      const streamName = this.options.streamName || STREAM_NAME;

      try {
        await this.jsm.streams.info(streamName);
        this.logger.log(`Stream ${streamName} already exists`);
      } catch {
        await this.jsm.streams.add({
          name: streamName,
          subjects: STREAM_SUBJECTS,
        });
        this.logger.log(`Created stream ${streamName}`);
      }

      this.logger.log(`Connected to NATS at ${this.options.servers.join(', ')}`);
    } catch (err) {
      this.logger.error(`Failed to connect to NATS: ${err}`);
      throw err;
    }
  }

  async onModuleDestroy() {
    if (this.nc) {
      await this.nc.drain();
    }
  }

  async publish<T>(subject: string, payload: T): Promise<void> {
    await this.js.publish(subject, this.sc.encode(JSON.stringify(payload)));
    this.logger.debug(`Published to ${subject}`);
  }

  async subscribe<T>(
    subject: string,
    durableName: string,
    handler: (data: T) => Promise<void>,
  ): Promise<void> {
    const opts = consumerOpts();
    opts.durable(durableName);
    opts.manualAck();
    opts.ackExplicit();
    opts.deliverTo(createInbox());
    opts.deliverAll();

    const sub = await this.js.subscribe(subject, opts);
    this.logger.log(`Subscribed to ${subject} as ${durableName}`);

    (async () => {
      for await (const msg of sub) {
        try {
          const data = JSON.parse(this.sc.decode(msg.data)) as T;
          await handler(data);
          msg.ack();
        } catch (err) {
          this.logger.error(`Error handling message on ${subject}: ${err}`);
          msg.nak();
        }
      }
    })();
  }

  async request<TReq, TRes>(subject: string, payload: TReq, timeoutMs = 5000): Promise<TRes> {
    const msg = await this.nc.request(
      subject,
      this.sc.encode(JSON.stringify(payload)),
      { timeout: timeoutMs },
    );
    return JSON.parse(this.sc.decode(msg.data)) as TRes;
  }

  async handleRequest<TReq, TRes>(
    subject: string,
    handler: (data: TReq) => Promise<TRes>,
  ): Promise<void> {
    const sub = this.nc.subscribe(subject);
    this.logger.log(`Handling requests on ${subject}`);

    (async () => {
      for await (const msg of sub) {
        try {
          const data = JSON.parse(this.sc.decode(msg.data)) as TReq;
          const result = await handler(data);
          msg.respond(this.sc.encode(JSON.stringify(result)));
        } catch (err) {
          this.logger.error(`Error handling request on ${subject}: ${err}`);
          msg.respond(this.sc.encode(JSON.stringify({ error: String(err) })));
        }
      }
    })();
  }
}
