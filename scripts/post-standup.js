import { WebClient } from '@slack/web-api';

// Initialize Slack client with bot token
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

// Configuration from environment variables
const channel = process.env.CHANNEL_ID;
const text = process.env.STANDUP_TEXT || 
  '[:mega:] [STANDUP] Ежедневный стендап — ответьте в треде:\n• *Yesterday:* Что было сделано вчера?\n• *Today:* Что планируете сделать сегодня?\n• *Blockers:* Есть ли блокеры?';

async function postStandup() {
  try {
    const result = await slack.chat.postMessage({
      channel: channel,
      text: text,
      unfurl_links: false,
      unfurl_media: false
    });
    
    console.log(`✅ Standup message posted successfully`);
    console.log(`   Channel: ${channel}`);
    console.log(`   Timestamp: ${result.ts}`);
    console.log(`   Message ID: ${result.message?.ts || result.ts}`);
  } catch (error) {
    console.error('❌ Error posting standup message:', error.message);
    if (error.data) {
      console.error('   Error details:', error.data);
    }
    process.exit(1);
  }
}

// Validate required environment variables
if (!process.env.SLACK_BOT_TOKEN) {
  console.error('❌ Error: SLACK_BOT_TOKEN environment variable is required');
  process.exit(1);
}

if (!process.env.CHANNEL_ID) {
  console.error('❌ Error: CHANNEL_ID environment variable is required');
  process.exit(1);
}

// Run the function
await postStandup();
