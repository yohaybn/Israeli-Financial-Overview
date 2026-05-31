"""Financial Overview — MQTT-backed Home Assistant integration."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall

from .const import (
    DOMAIN,
    SERVICE_CHAT,
    SERVICE_GENERATE_REPORT,
    SERVICE_REFRESH_INSIGHTS,
    SERVICE_SCRAPE,
)
from .coordinator import FinancialOverviewCoordinator

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.BINARY_SENSOR, Platform.SENSOR, Platform.BUTTON]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = FinancialOverviewCoordinator(hass, entry.data)
    await coordinator.async_setup()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    _register_services(hass, coordinator)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_forward_entry_unload(entry, PLATFORMS)
    coordinator: FinancialOverviewCoordinator | None = hass.data.get(DOMAIN, {}).pop(
        entry.entry_id, None
    )
    if coordinator:
        await coordinator.async_shutdown()
    return unload_ok


def _register_services(hass: HomeAssistant, coordinator: FinancialOverviewCoordinator) -> None:
    async def scrape_service(call: ServiceCall) -> None:
        args: dict[str, Any] = {}
        if call.data.get("all"):
            args["all"] = True
        if call.data.get("profile_id"):
            args["profileId"] = call.data["profile_id"]
        await coordinator.async_send_command("scrape", args)

    async def chat_service(call: ServiceCall) -> None:
        message = call.data.get("message", "")
        await coordinator.async_send_command("chat", {"message": message})

    async def report_service(_call: ServiceCall) -> None:
        await coordinator.async_send_command("report", {"scope": "month"})

    async def refresh_service(_call: ServiceCall) -> None:
        await coordinator.async_send_command("refresh_rules")

    hass.services.async_register(DOMAIN, SERVICE_SCRAPE, scrape_service)
    hass.services.async_register(DOMAIN, SERVICE_CHAT, chat_service)
    hass.services.async_register(DOMAIN, SERVICE_GENERATE_REPORT, report_service)
    hass.services.async_register(DOMAIN, SERVICE_REFRESH_INSIGHTS, refresh_service)
