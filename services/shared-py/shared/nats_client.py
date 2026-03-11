"""NATS JetStream client wrapper.

Mirrors libs/nats-client/src/nats.service.ts — same stream, same subjects,
same deliver_policy=NEW to avoid stale message replay.
"""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import nats
from nats.aio.client import Client as NatsClient
from nats.js import JetStreamContext
from nats.js.api import ConsumerConfig, DeliverPolicy, StreamConfig

from .config import NATS_URL
from .events import STREAM_NAME

logger = logging.getLogger(__name__)


class NatsService:
    """Async NATS JetStream client with publish/subscribe."""

    def __init__(self) -> None:
        self._nc: NatsClient | None = None
        self._js: JetStreamContext | None = None
        self._tasks: list[asyncio.Task] = []

    async def connect(self, url: str | None = None) -> None:
        """Connect to NATS and ensure the JetStream stream exists."""
        target = url or NATS_URL
        logger.info(f"Connecting to NATS at {target}")
        self._nc = await nats.connect(target)
        self._js = self._nc.jetstream()

        # Ensure the stream exists (idempotent)
        try:
            await self._js.find_stream_name_by_subject("agent.*")
        except Exception:
            await self._js.add_stream(
                StreamConfig(
                    name=STREAM_NAME,
                    subjects=[
                        "agent.*",
                        "agent.>",
                        "onboarding.*",
                        "onboarding.>",
                        "connection.*",
                        "connection.>",
                        "rag.*",
                        "rag.>",
                        "scheduler.*",
                        "scheduler.>",
                        "runtime.*",
                        "runtime.>",
                        "tools.*",
                        "tools.>",
                    ],
                )
            )

    async def publish(self, subject: str, payload: Any) -> None:
        """Publish a JSON message to a NATS JetStream subject."""
        if not self._js:
            raise RuntimeError("NATS not connected")
        data = json.dumps(
            payload if isinstance(payload, dict) else payload.model_dump()
        ).encode()
        await self._js.publish(subject, data)
        logger.debug(f"Published to {subject}")

    async def subscribe(
        self,
        subject: str,
        queue_group: str,
        handler: Callable[[dict], Awaitable[None]],
    ) -> None:
        """Subscribe to a JetStream subject with a durable consumer.

        Uses DeliverPolicy.NEW to avoid replaying old messages on restart.
        The message loop runs as a background task so multiple subscriptions
        can be registered without blocking each other.
        """
        if not self._js:
            raise RuntimeError("NATS not connected")

        config = ConsumerConfig(
            durable_name=queue_group,
            deliver_policy=DeliverPolicy.NEW,
        )

        sub = await self._js.subscribe(
            subject,
            queue=queue_group,
            config=config,
        )

        logger.info(f"Subscribed to {subject} (queue={queue_group})")

        async def _consume():
            async for msg in sub.messages:
                try:
                    data = json.loads(msg.data.decode())
                    # Ack immediately before processing. Handlers can run for
                    # minutes (agent execution) which exceeds NATS ack_wait
                    # (default 30s), causing JetStream to redeliver and restart
                    # the entire workflow. Handlers have their own error handling
                    # and publish failure events, so redelivery is not needed.
                    await msg.ack()
                    await handler(data)
                except Exception as e:
                    logger.error(f"Error handling {subject}: {e}", exc_info=True)

        task = asyncio.create_task(_consume())
        self._tasks.append(task)

    async def close(self) -> None:
        """Close the NATS connection."""
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()
        if self._nc:
            await self._nc.close()
            logger.info("NATS connection closed")
