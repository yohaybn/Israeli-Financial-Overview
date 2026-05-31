"""Sensor platform for Financial Overview."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
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
            FinancialOverviewReviewSensor(coordinator, entry),
            FinancialOverviewInsightScoreSensor(coordinator, entry),
            FinancialOverviewAlertCountSensor(coordinator, entry),
        ]
    )


class FinancialOverviewSensor(Entity):
    _attr_has_entity_name = True

    def __init__(self, coordinator: FinancialOverviewCoordinator, entry: ConfigEntry) -> None:
        self.coordinator = coordinator
        self._entry = entry
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.data.get("device_id", "bank_scraper"))},
            "name": "Financial Overview",
            "manufacturer": "Israeli Financial Overview",
        }

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.coordinator.async_add_listener(self.async_write_ha_state))


class FinancialOverviewReviewSensor(FinancialOverviewSensor):
    _attr_name = "Review pending count"
    _attr_icon = "mdi:clipboard-list-outline"

    @property
    def native_value(self):
        review = self.coordinator.get_state("review") or {}
        return review.get("count", 0)


class FinancialOverviewInsightScoreSensor(FinancialOverviewSensor):
    _attr_name = "Top insight score"
    _attr_icon = "mdi:lightbulb-on-outline"

    @property
    def native_value(self):
        insights = self.coordinator.get_state("insights") or {}
        items = insights.get("items") or []
        return items[0]["score"] if items else 0


class FinancialOverviewAlertCountSensor(FinancialOverviewSensor):
    _attr_name = "AI alert count"
    _attr_icon = "mdi:bell-alert-outline"

    @property
    def native_value(self):
        alerts = self.coordinator.get_state("alerts") or {}
        return alerts.get("count", 0)
