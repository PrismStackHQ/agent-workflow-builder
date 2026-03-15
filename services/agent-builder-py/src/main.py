"""Entry point for the agent-builder Python service."""

import asyncio
import logging
import signal
from contextlib import asynccontextmanager

from shared.config import NATS_URL
from shared.db import async_session_factory
from shared.nats_client import NatsService
from src.handler import register_handlers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("agent-builder")


async def main():
    nats = NatsService()
    await nats.connect(NATS_URL)

    @asynccontextmanager
    async def db_factory():
        async with async_session_factory() as session:
            yield session

    await register_handlers(nats, db_factory)
    logger.info("Agent builder service started")

    # Keep running until shutdown signal
    stop = asyncio.Event()

    def handle_signal():
        logger.info("Shutdown signal received")
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, handle_signal)

    await stop.wait()
    await nats.close()
    logger.info("Agent builder service stopped")


if __name__ == "__main__":
    asyncio.run(main())
