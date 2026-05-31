"""Button platform for Financial Overview."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
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
            FinancialOverviewScrapeAllButton(coordinator, entry),
            FinancialOverviewSchedulerButton(coordinator, entry),
            FinancialOverviewReportButton(coordinator, entry),
            FinancialOverviewRefreshInsightsButton(coordinator, entry),
        ]
    )


class FinancialOverviewButton(Entity, ButtonEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator: FinancialOverviewCoordinator, entry: ConfigEntry) -> None:
        self.coordinator = coordinator
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.data.get("device_id", "bank_scraper"))},
            "name": "Financial Overview",
            "manufacturer": "Israeli Financial Overview",
        }


class FinancialOverviewScrapeAllButton(FinancialOverviewButton):
    _attr_name = "Scrape all profiles"
    _attr_icon = "mdi:bank"

    async def async_press(self) -> None:
        await self.coordinator.async_send_command("scrape", {"all": True})


class FinancialOverviewSchedulerButton(FinancialOverviewButton):
    _attr_name = "Run scheduled scrape"
    _attr_icon = "mdi:calendar-clock"

    async def async_press(self) -> None:
        await self.coordinator.async_send_command("scheduler_run_now")


class FinancialOverviewReportButton(FinancialOverviewButton):
    _attr_name = "Generate financial report"
    _attr_icon = "mdi:file-pdf-box"

    async def async_press(self) -> None:
        await self.coordinator.async_send_command("report", {"scope": "month"})


class FinancialOverviewRefreshInsightsButton(FinancialOverviewButton):
    _attr_name = "Refresh insight rules"
    _attr_icon = "mdi:refresh"

    async def async_press(self) -> None:
        await self.coordinator.async_send_command("refresh_rules")
