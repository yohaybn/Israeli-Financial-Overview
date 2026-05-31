"""Config flow for Financial Overview MQTT integration."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import CONF_NAME

from .const import (
    CONF_COMMAND_SECRET,
    CONF_COMMAND_TOPIC,
    CONF_DEVICE_ID,
    CONF_STATE_PREFIX,
    DEFAULT_COMMAND_TOPIC,
    DEFAULT_DEVICE_ID,
    DEFAULT_STATE_PREFIX,
    DOMAIN,
)


class FinancialOverviewConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")

        if user_input is not None:
            return self.async_create_entry(
                title=user_input.get(CONF_NAME, "Financial Overview"),
                data=user_input,
            )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Optional(CONF_NAME, default="Financial Overview"): str,
                    vol.Required(CONF_COMMAND_SECRET): str,
                    vol.Optional(CONF_DEVICE_ID, default=DEFAULT_DEVICE_ID): str,
                    vol.Optional(CONF_COMMAND_TOPIC, default=DEFAULT_COMMAND_TOPIC): str,
                    vol.Optional(CONF_STATE_PREFIX, default=DEFAULT_STATE_PREFIX): str,
                }
            ),
        )
