# Slack Standup Reminder Bot

A smart Slack bot that automatically reminds specific user group members to post their daily standup, with intelligent filtering based on holidays and leave status.

## 🚀 Features

- **Works with Workflow Builder** - Detects standup messages posted by Slack Workflow Builder
- **Smart reminders** - Only mentions users from a specific user group who haven't responded
- **UK Holiday awareness** - Automatically skips UK bank holidays
- **Timetastic integration** - Skips users on holiday, sick leave, or day off
- **Email-based mapping** - Matches Slack users with Timetastic via email
- **Detailed logging** - Shows who was skipped and why
- **Flexible configuration** - All settings via environment variables
- **Private channel support** - Works with both public and private channels
- **Batch mentions** - Groups mentions in batches of 20 to avoid limits
- **Rate limiting** - Respects API rate limits with built-in throttling
- **Caching** - Reduces API calls with intelligent caching

## 📋 Requirements

- Node.js 18+
- Slack Workspace with admin rights
- Slack App with required permissions
- Slack Workflow Builder posting daily standup messages

## 🔧 Installation

### 1. Clone the repository

```bash
git clone https://github.com/JorPipRod23/slack-standup-reminder.git
cd slack-standup-reminder
npm install
```

### 2. Create Slack App

1. Go to https://api.slack.com/apps
2. Click **Create New App** → **From scratch**
3. Name it (e.g., "Standup Reminder") and select your workspace

### 3. Configure Permissions (OAuth & Permissions)

#### Bot Token Scopes:
- `chat:write` - Post messages
- `conversations.history` - Read channel history
- `conversations.replies` - Read thread replies
- `channels:read` - Read public channel info
- `groups:read` - Read private channel info (required for G... channels)
- `users:read` - Read user information (optional)

#### User Token Scopes (for user groups):
- `usergroups:read` - Read user group members
- `users:read` - Read user information

### 4. Install App to Workspace

1. In **OAuth & Permissions** click **Install to Workspace**
2. Authorize the permissions
3. Copy **Bot User OAuth Token** (starts with `xoxb-`)
4. Copy **User OAuth Token** (starts with `xoxp-`)

### 5. Add Bot to Channel

In your Slack channel run:
```
/invite @Standup Reminder
```
(use your app name)

## ⚙️ Configuration

### Environment Variables

Create `.env` file based on `.env.example`:

```bash
# Required
SLACK_BOT_TOKEN=xoxb-your-bot-token        # Bot User OAuth Token
SLACK_USER_TOKEN=xoxp-your-user-token      # User OAuth Token (for user groups)
CHANNEL_ID=G011C5ETX4Z                     # Channel ID (C... or G...)
USERGROUP_ID=S09AZ861LFJ                   # User Group ID

# Optional
STANDUP_KEYWORDS=standup,daily             # Keywords to identify standup messages
REMINDER_TEXT=Please post your standup!    # Reminder message text
```

### Finding IDs

#### Channel ID:
1. Open channel in Slack
2. Click channel name at the top
3. Copy Channel ID from the popup

#### User Group ID:
1. Go to https://app.slack.com/client/YOUR_WORKSPACE/browse-user-groups
2. Click on the group
3. ID is in the URL: `...usergroup/SXXXXXXXXX`

## 🚀 Usage

### Local Testing

```bash
# Basic version (without Timetastic/holidays)
npm run remind

# Enhanced version (with Timetastic and UK holidays)
npm run remind:enhanced
```

### Deploy on Render.com (Recommended)

1. Create account on [Render.com](https://render.com)
2. Connect GitHub repository
3. Create **Cron Job**:

#### Cron Job: Reminder at 13:00
- **Name**: Standup Reminder
- **Command**: `node scripts/remind-enhanced.js` (for enhanced version with holidays/leave)
- **Schedule**: `0 10 * * 1-5` (10:00 UTC = 13:00 MSK, Mon-Fri)
- **Timezone**: UTC (or your timezone)
- **Environment Variables**: Add all from `.env` including TIMETASTIC_API_KEY

### Alternative: GitHub Actions

Create `.github/workflows/reminder.yml`:

```yaml
name: Standup Reminder

on:
  schedule:
    - cron: '0 10 * * 1-5' # 13:00 MSK (UTC+3)
  workflow_dispatch:

jobs:
  remind:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - name: Send Reminders
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
          SLACK_USER_TOKEN: ${{ secrets.SLACK_USER_TOKEN }}
          CHANNEL_ID: ${{ secrets.CHANNEL_ID }}
          USERGROUP_ID: ${{ secrets.USERGROUP_ID }}
        run: npm run remind
```

## 📊 How It Works

### remind.js
1. Finds today's standup message from Workflow Builder (by keywords)
2. Gets members of the specified user group
3. Checks who already replied in the thread
4. Mentions only group members who haven't replied
5. Batches mentions (20 users per message) to avoid limits

## 🐛 Troubleshooting

### "not_in_channel"
Bot is not in the channel. Use `/invite @BotName` in the channel.

### "channel_not_found" 
- Check CHANNEL_ID is correct
- For private channels (G...) you need `groups:read` scope
- Make sure bot is added to the channel

### "missing_scope" with user groups
Use User Token (xoxp-) with `usergroups:read` scope, not Bot Token.

### Bot doesn't find standup message
- Check that message contains one of the keywords (default: "standup", "стендап", "daily")
- Increase search limit in `conversations.history`
- Check server timezone

### Message too long with mentions
Script automatically splits mentions into batches of 20 users.

### Timetastic not working
- Check API key is correct
- Ensure users have matching emails in Slack and Timetastic
- Check Timetastic API status

### UK holidays not detected
- Bot uses both date-holidays library and UK Gov API
- If both fail, bot continues (fail-open approach)

## 🔒 Security

- **Never** commit tokens to repository
- Use `.env` file locally (it's in `.gitignore`)
- Use platform secrets in production (Render, GitHub Secrets, etc.)
- Rotate tokens regularly
- Limit app permissions to minimum required

## 📝 License

MIT

## 🤝 Support

For issues, create an Issue in the repository.