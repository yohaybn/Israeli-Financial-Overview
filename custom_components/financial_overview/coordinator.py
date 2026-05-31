"""MQTT coordinator for Financial Overview state + commands."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from homeassistant.components import mqtt
from homeassistant.core import HomeAssistant, callback

from .const import CONF_COMMAND_SECRET, CONF_COMMAND_TOPIC, CONF_STATE_PREFIX

_LOGGER = logging.getLogger(__name__)


class FinancialOverviewCoordinator:
    """Subscribe to retained state topics; publish commands via MQTT."""

    def __init__(self, hass: HomeAssistant, data: dict[str, Any]) -> None:
        self.hass = hass
        self.command_topic = data[CONF_COMMAND_TOPIC]
        self.command_secret = data[CONF_COMMAND_SECRET]
        self.state_prefix = data[CONF_STATE_PREFIX].rstrip("/")
        self._state: dict[str, Any] = {}
        self._listeners: list[callable] = []
        self._unsubscribes: list[callable] = []

    @callback
    def async_add_listener(self, update_callback: callable) -> callable:
        self._listeners.append(update_callback)

        def remove() -> None:
            self._listeners.remove(update_callback)

        return remove

    @callback
    def _notify(self) -> None:
        for cb in self._listeners:
            cb()

    def get_state(self, key: str) -> Any:
        return self._state.get(key)

    async def async_setup(self) -> None:
        topics = [
            ("scrape", f"{self.state_prefix}/scrape"),
            ("review", f"{self.state_prefix}/review"),
            ("insights", f"{self.state_prefix}/insights/top"),
            ("alerts", f"{self.state_prefix}/alerts"),
            ("app_lock", f"{self.state_prefix}/app_lock"),
            ("scheduler", f"{self.state_prefix}/scheduler"),
        ]

        @callback
        def make_message_handler(state_key: str):
            def handler(msg: mqtt.ReceiveMessage) -> None:
                try:
                    payload = msg.payload
                    if isinstance(payload, bytes):
                        payload = payload.decode("utf-8")
                    self._state[state_key] = json.loads(payload)
                except (json.JSONDecodeError, UnicodeDecodeError):
                    self._state[state_key] = payload
                self._notify()

            return handler

        for key, topic in topics:
            unsub = await mqtt.async_subscribe(
                self.hass, topic, make_message_handler(key), qos=1
            )
            self._unsubscribes.append(unsub)

    async def async_shutdown(self) -> None:
        for unsub in self._unsubscribes:
            unsub()
        self._unsubscribes.clear()

    async def async_send_command(self, command: str, args: dict[str, Any] | None = None) -> None:
        payload = json.dumps(
            {
                "command": command,
                "secret": self.command_secret,
                "requestId": f"ha-{command}-{asyncio.get_event_loop().time()}",
                "args": args or {},
            }
        )
        await mqtt.async_publish(self.hass, self.command_topic, payload, qos=1)
