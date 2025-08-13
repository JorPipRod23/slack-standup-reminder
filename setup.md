# Setup Instructions for Wert.io Slack Bot

## Your App Details
- **App ID**: A09AZ8RHPG8
- **Channel ID**: G011C5ETX4Z (private channel)
- **User Group ID**: S09AZ861LFJ

## Step 1: Get Your Tokens

### Bot Token (xoxb-...)
1. Go to: https://api.slack.com/apps/A09AZ8RHPG8/oauth
2. Look for **Bot User OAuth Token** (starts with `xoxb-`)
3. Copy it

### User Token (xoxp-...)
1. Same page: https://api.slack.com/apps/A09AZ8RHPG8/oauth
2. Look for **User OAuth Token** (starts with `xoxp-`)
3. If not visible, click **Reinstall to Workspace** and authorize as yourself
4. Copy the User OAuth Token

## Step 2: Update .env File

Edit the `.env` file and replace the placeholders:

```bash
# Replace these lines:
SLACK_BOT_TOKEN=xoxb-YOUR-BOT-TOKEN-HERE
SLACK_USER_TOKEN=xoxp-YOUR-USER-TOKEN-HERE

# With your actual tokens:
SLACK_BOT_TOKEN=xoxb-1000636397286-[rest of your token]
SLACK_USER_TOKEN=xoxp-1000636397286-[rest of your token]
```

## Step 3: Add Required Scopes

Go to: https://api.slack.com/apps/A09AZ8RHPG8/oauth

### Bot Token Scopes (add these):
- `chat:write`
- `conversations.history`
- `conversations.replies`
- `groups:read` (for private channel G011C5ETX4Z)
- `users:read`

### User Token Scopes (add these):
- `usergroups:read`
- `users:read`

After adding scopes, click **Reinstall to Workspace**.

## Step 4: Add Bot to Channel

In Slack channel G011C5ETX4Z, run:
```
/invite @Standup Reminder
```
(or whatever you named your app)

## Step 5: Test Locally

```bash
# Install dependencies
npm install

# Test the reminder (will look for today's standup from Workflow)
npm run remind
```

## Step 6: Deploy to Render

1. Push to GitHub:
```bash
git add .
git commit -m "Configure for Wert.io workspace"
git push
```

2. Go to [Render.com](https://render.com)
3. Create New → Cron Job
4. Connect your GitHub repo
5. Configure:
   - **Command**: `node scripts/remind.js`
   - **Schedule**: `0 13 * * 1-5` (13:00 Mon-Fri)
   - **Timezone**: Europe/Moscow (or your timezone)
   - **Environment Variables**: Copy all from your `.env`

## Important Security Notes

Since you showed your Client Secret and Signing Secret earlier:

1. Go to: https://api.slack.com/apps/A09AZ8RHPG8/general
2. Under **App Credentials**:
   - Click **Regenerate** next to Client Secret
   - Click **Regenerate** next to Signing Secret
3. Delete/revoke the xapp-... token (not needed for this bot)

## Verification

The bot will:
1. Find today's standup message posted by Workflow Builder (using keywords)
2. Get members of user group S09AZ861LFJ
3. Check who replied in the thread
4. Mention only those who haven't replied

## Support

If you see any errors, check:
- Bot is in channel (G011C5ETX4Z)
- Both tokens are set correctly
- Workflow posted a standup today with keywords (стендап/standup/daily)
