# Telegram Bot Integration Guide

## Overview

Financial Overview (מבט כלכלי) includes a full-featured Telegram bot that allows you to:

- 📬 **Receive notifications** about transaction scrapers
- 💬 **Chat with AI** about your financial transactions
- 🏦 **Control scrapers** directly from Telegram
- ⚙️ **Manage settings** via chat commands

## Quick Start

### 1. Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` command
3. Follow the prompts to name your bot
4. BotFather will provide your **Bot Token** (e.g., `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### 2. Configure the Bot Token

#### Option A: Via Environment Variables (.env)

Add to your `.env` file:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

#### Option B: Via UI

1. Go to **Configuration** → **Telegram** tab
2. Paste your bot token in the "Bot Token" field
3. Click **Save**
4. Click **Start** to activate the bot

### 3. Get Your Chat ID

To receive notifications or use the bot, you need your Telegram Chat ID:

**For Private Chats:**
1. Start a chat with your bot by searching it on Telegram
2. Send any message to your bot (e.g. `/start`)
3. In a **private** chat, your **chat ID** is the same number as your **Telegram user ID**.

**If you are not authorized yet** (server uses an `allowedUsers` list and your account is not on it): send any message to the bot anyway. You will get an “access denied” style reply that still includes **Your User ID** as a copyable number—share that with the admin so they can add you to `allowedUsers` and to notification chats if needed.

**Alternative — getUpdates API:**
1. After messaging the bot, open: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
2. Look for `"chat": {"id": <YOUR_CHAT_ID>}` or `"from": {"id": ...}` for the sender
3. Copy the chat ID number

**For Group Chats:**
1. Add your bot to a Telegram group
2. Send a message mentioning the bot: `@your_bot_name hello`
3. Use the same method above to find the group's chat ID (will start with `-`)

## Features & Commands

### Available Commands

| Command | Description | Usage |
|---------|-------------|-------|
| `/start` | Initialize bot and show welcome message | Send in private chat with bot |
| `/help` | Show all available commands | Send in any chat |
| `/scrape` | Choose and run a scraper | Select profile from inline buttons |
| `/chat` | Enter AI conversation mode | Ask questions about transactions |
| `/settings` | Manage notification preferences | Configure via interactive menu |
| `/subscribe` | Enable transaction notifications | Get alerts for new scrapes |
| `/unsubscribe` | Disable notifications | No more alerts |
| `/status` | Check bot and system status | See if bot is active |

### Using AI Chat

```
You: /chat
Bot: 💬 AI Chat Mode activated!

You: What are my largest expenses?
Bot: Based on your transactions, your largest expense categories are...

You: Show me spending trends
Bot: [Detailed analysis of spending patterns]
```

### Running Scrapers

```
You: /scrape
Bot: 🏦 Select the profile to scrape:
     [Leumi Bank] [Bank Hapoalim] [Other Bank]

You: Click on desired bank
Bot: ⏳ Executing scraper, please wait...
     ✅ Scrape Completed Successfully
     
     📊 Results:
     • Accounts: 3
     • Transactions: 487
     • Duration: 2350ms
```

## Notification Chats Setup

### Add Chat to Notifications

1. Go to **Configuration** → **Telegram** → **Notification Chats**
2. Enter the chat ID of the chat that should receive notifications
3. Click **Add**

### Notification Events

The bot will send notifications when:
- Scraper completes successfully ✅
- Scraper encounters an error ❌
- Transactions are analyzed with AI insights
- Pipeline executions complete
- System alerts occur

### Notification Detail Levels

Configure how detailed notifications should be:
- **Minimal**: Just status and duration
- **Normal**: Status, duration, stages, transaction count, insights
- **Detailed**: Full information including account details and balance
- **Verbose**: Complete JSON dump for advanced users

## Configuration Panel

Access the Telegram settings from the web UI:

1. Navigate to **Configuration** → **Telegram** tab
2. Configure:
   - Bot Token (with masked display for security)
   - Notification Chats (add/remove chat IDs)
   - Test connection
   - View advanced settings

### Test Connection

To verify your configuration:
1. Enter your bot token
2. Enter your chat ID  
3. Click **Test**
4. You should receive a confirmation message in Telegram

## API Endpoints

The Telegram feature exposes the following API endpoints:

### Configuration

```bash
# Get Telegram config
GET /api/telegram/config

# Update configuration
POST /api/telegram/config
{
  "botToken": "...",
  "adminChatIds": ["123456"],
  "notificationChatIds": ["123456", "-789012"]
}
```

### Bot Control

```bash
# Start the bot
POST /api/telegram/start
{
  "botToken": "optional_token_to_override_config"
}

# Stop the bot
POST /api/telegram/stop

# Get bot status
GET /api/telegram/status

# Test connection
POST /api/telegram/test
{
  "botToken": "...",
  "chatId": "..."
}
```

### Notification Chats

```bash
# Get all notification chats
GET /api/telegram/notification-chats

# Add chat to notifications
POST /api/telegram/notification-chat/add
{
  "chatId": "123456"
}

# Remove chat from notifications
POST /api/telegram/notification-chat/remove
{
  "chatId": "123456"
}
```

## Advanced Features

### Multi-Language Support

The Telegram UI automatically detects your language preference from the web interface:
- 🇺🇸 English
- 🇮🇱 Hebrew

### Inline Buttons

The bot uses Telegram's inline buttons for easy interaction:
- Profile selection for scrapers
- Settings toggles
- Navigation between menu options

### Long Message Handling

If AI responses exceed Telegram's 4096 character limit, they're automatically split into multiple messages.

### Message Templating

Notifications use HTML formatting for better readability:
- **Bold text** for titles
- `code formatting` for IDs
- ✅/❌ emojis for status

## Troubleshooting

### Bot Not Responding

1. Check bot token is correct
2. Verify bot was started: **Configuration** → **Telegram** → **Start** button
3. Ensure you've added the bot to Telegram by typing `/start`
4. Check server logs for errors: **Configuration** → **Maintenance** → View logs

### Not Receiving Notifications

1. Verify chat ID is correct
2. Check chat is added to notification list: **Configuration** → **Telegram** → **Notification Chats**
3. Test connection: Click **Test** button with your chat ID
4. Ensure bot status is "Active" (green indicator)

### Can't Get Chat ID

Try these methods:
1. Send a message to the bot, then check: `https://api.telegram.org/bot<TOKEN>/getUpdates`
2. For groups, add bot and mention it: `@botname hello`
3. Look for `"chat": {"id": <number>}`

### Errors in Web UI

- **"Bot token not provided"**: Add token to config and save
- **"Telegram API error"**: Token might be invalid - verify with @BotFather
- **"Failed to add chat"**: Chat ID format might be wrong (should be all numbers for private, `-` prefix for groups)

## Security Considerations

1. **Bot Token Protection**: 
   - Never share your bot token publicly
   - Token is masked in UI display (shows `***...last10chars`)
   - Regenerate token via @BotFather if compromised

2. **Chat ID Privacy**:
   - Store securely, like passwords
   - Only add trusted chats for notifications
   - Remove old/unused chat IDs

3. **Admin Chats**:
   - Configure specific admin-level permissions
   - Only admins can execute sensitive commands
   - Consider using a private group for admin alerts

## Examples

### Example 1: Get Weekly Spending Summary

```
You: /chat
You: Can you summarize my spending this week by category?
Bot: 📊 Weekly Spending Summary:
     💰 Total: ₪4,250
     - Groceries: ₪800
     - Transportation: ₪300
     - Entertainment: ₪450
     - Utilities: ₪200
     ... detailed breakdown ...
```

### Example 2: Automated Scraper Execution

```
1. Setup monthly scraper in Pipeline Configuration
2. Add notification chat in Telegram settings
3. When pipeline runs:
   - Bot sends: "📬 Pipeline started"
   - After completion: "✅ Scrape completed - 487 transactions"
   - AI insights included automatically
```

### Example 3: Financial Analysis

```
You: /chat
You: Have my expenses increased this month?
Bot: 📈 Yes, your spending increased by 12% compared to last month
     
     Main drivers:
     • Travel: +₪450
     • Dining: +₪280
     • Shopping: +₪150
     
     Areas within budget:
     ✅ Groceries
     ✅ Utilities
```

## Limitations & Known Issues

1. **Message Rate Limiting**: Telegram has rate limits (avoid sending 25+ messages/second)
2. **File Uploads**: Currently doesn't support file uploads to bot
3. **Media Messages**: Transactions shown as text only (no visual charts yet)
4. **Group Permissions**: Ensure bot has required permissions in groups

## Future Enhancements

Planned features for future releases:
- 📊 Interactive transaction charts
- 📝 Export data to files
- 🔔 Smart notifications (only major changes)
- 🌙 Scheduled reports
- 👥 Multi-user support with roles
- 🔄 Sync with Google Sheets via Telegram

## Support

For issues or feature requests:
1. Check the troubleshooting section above
2. Review server logs in **Configuration** → **Logs** tab
3. Test with the **Test Connection** feature
4. Report issues with detailed error messages
