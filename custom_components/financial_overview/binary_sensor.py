"""Binary sensor platform for Financial Overview."""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.entity import Entity

from .const import DOMAIN
from .coordinator import FinancialOverviewCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: FinancialOverviewCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        [
            FinancialOverviewScrapeRunningBinary(coordinator, entry),
            FinancialOverviewAppLockedBinary(coordinator, entry),
        ]
    )


class FinancialOverviewBinary(Entity, BinarySensorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator: FinancialOverviewCoordinator, entry: ConfigEntry) -> None:
        self.coordinator = coordinator
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.data.get("device_id", "bank_scraper"))},
            "name": "Financial Overview",
            "manufacturer": "Israeli Financial Overview",
        }

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.coordinator.async_add_listener(self.async_write_ha_state))


class FinancialOverviewScrapeRunningBinary(FinancialOverviewBinary):
    _attr_name = "Scrape running"
    _attr_device_class = "running"

    @property
    def is_on(self) -> bool:
        scrape = self.coordinator.get_state("scrape") or {}
        return bool(scrape.get("running"))


class FinancialOverviewAppLockedBinary(FinancialOverviewBinary):
    _attr_name = "App locked"
    _attr_icon = "mdi:lock"

    @property
    def is_on(self) -> bool:
        lock = self.coordinator.get_state("app_lock") or {}
        return bool(lock.get("configured")) and not bool(lock.get("unlocked"))
