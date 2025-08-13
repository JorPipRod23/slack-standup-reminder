import { WebClient } from '@slack/web-api';

// Initialize Slack clients
const botClient = new WebClient(process.env.SLACK_BOT_TOKEN);   // Bot token for posting messages
const userClient = new WebClient(process.env.SLACK_USER_TOKEN); // User token for reading user groups

// Configuration from environment variables
const channel = process.env.CHANNEL_ID;
const userGroupId = process.env.USERGROUP_ID;
// Keywords to identify standup messages from Workflow Builder
const standupKeywords = (process.env.STANDUP_KEYWORDS || 'standup,стендап,daily').toLowerCase().split(',');
const reminderText = process.env.REMINDER_TEXT || 'Коллеги, напоминаю про стендап! Пожалуйста, отпишитесь в треде до 13:00 📝';

/**
 * Check if a timestamp is from today
 */
function isToday(timestampSeconds) {
  const messageDate = new Date(timestampSeconds * 1000);
  const today = new Date();
  
  return messageDate.getFullYear() === today.getFullYear() &&
         messageDate.getMonth() === today.getMonth() &&
         messageDate.getDate() === today.getDate();
}

/**
 * Check if message is a standup message based on keywords
 */
function isStandupMessage(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return standupKeywords.some(keyword => lowerText.includes(keyword.trim()));
}

/**
 * Find today's standup message posted by Workflow Builder
 */
async function findTodayStandupMessage() {
  try {
    // Fetch recent messages from the channel
    const history = await botClient.conversations.history({
      channel: channel,
      limit: 100 // Look through last 100 messages
    });
    
    // Find today's standup message (posted by Workflow Builder)
    const standupMessage = (history.messages || []).find(message => {
      // Check if message is from today
      const timestampSeconds = Number((message.ts || '0').split('.')[0]);
      if (!isToday(timestampSeconds)) return false;
      
      // Check if it's from Workflow Builder (has bot_id but no subtype, or subtype is 'bot_message')
      const isFromWorkflow = message.bot_id && (!message.subtype || message.subtype === 'bot_message');
      if (!isFromWorkflow) return false;
      
      // Check if message contains standup keywords
      if (!isStandupMessage(message.text)) return false;
      
      return true;
    });
    
    if (standupMessage) {
      console.log(`✅ Found today's standup message from Workflow: ${standupMessage.ts}`);
      console.log(`   Message preview: ${standupMessage.text?.substring(0, 50)}...`);
      return standupMessage.ts;
    } else {
      console.log('⚠️  No standup message from Workflow found for today');
      console.log('   Looking for keywords:', standupKeywords.join(', '));
      return null;
    }
  } catch (error) {
    console.error('❌ Error finding standup message:', error.message);
    throw error;
  }
}

/**
 * Get members of the specified user group
 */
async function getUserGroupMembers() {
  try {
    // Note: usergroups.users.list typically requires a user token
    const result = await userClient.usergroups.users.list({
      usergroup: userGroupId
    });
    
    const members = result.users || [];
    console.log(`✅ Found ${members.length} members in user group ${userGroupId}`);
    return new Set(members);
  } catch (error) {
    console.error('❌ Error fetching user group members:', error.message);
    
    // Fallback: try with bot token (might work in some workspaces)
    try {
      console.log('   Attempting with bot token as fallback...');
      const result = await botClient.usergroups.users.list({
        usergroup: userGroupId
      });
      const members = result.users || [];
      console.log(`✅ Fallback successful: found ${members.length} members`);
      return new Set(members);
    } catch (fallbackError) {
      console.error('❌ Fallback also failed:', fallbackError.message);
      throw error; // Throw original error
    }
  }
}

/**
 * Get users who have replied to the standup thread
 */
async function getThreadResponders(threadTs) {
  try {
    const replies = await botClient.conversations.replies({
      channel: channel,
      ts: threadTs,
      limit: 1000 // Get up to 1000 replies
    });
    
    // Extract unique user IDs (excluding the bot's original message)
    const responders = new Set(
      (replies.messages || [])
        .slice(1) // Skip the first message (the standup post itself)
        .map(message => message.user)
        .filter(Boolean)
    );
    
    console.log(`✅ Found ${responders.size} users who replied to the thread`);
    return responders;
  } catch (error) {
    console.error('❌ Error fetching thread replies:', error.message);
    throw error;
  }
}

/**
 * Send reminder messages to users who haven't responded
 */
async function sendReminders(threadTs, usersToRemind) {
  if (usersToRemind.length === 0) {
    // Everyone has responded
    await botClient.chat.postMessage({
      channel: channel,
      thread_ts: threadTs,
      text: '✅ Все участники группы уже отписались в стендапе! 👍'
    });
    console.log('✅ All group members have responded');
    return;
  }
  
  console.log(`📢 Sending reminders to ${usersToRemind.length} users`);
  
  // Send reminders in batches of 20 users (to avoid message length limits)
  const batchSize = 20;
  for (let i = 0; i < usersToRemind.length; i += batchSize) {
    const batch = usersToRemind.slice(i, i + batchSize);
    const mentions = batch.map(userId => `<@${userId}>`).join(' ');
    
    // Format message with reminder text first, then mentions
    const message = `${reminderText}\n\n${mentions}`;
    
    try {
      await botClient.chat.postMessage({
        channel: channel,
        thread_ts: threadTs,
        text: message,
        unfurl_links: false,
        unfurl_media: false
      });
      
      console.log(`   Batch ${Math.floor(i / batchSize) + 1}: reminded ${batch.length} users`);
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < usersToRemind.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`❌ Error sending reminder batch:`, error.message);
    }
  }
  
  console.log('✅ All reminders sent');
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🚀 Starting standup reminder process...');
    
    // 1. Find today's standup message from Workflow Builder
    const standupMessageTs = await findTodayStandupMessage();
    if (!standupMessageTs) {
      console.log('⚠️  No standup message found for today. Exiting.');
      return;
    }
    
    // 2. Get members of the user group
    const groupMembers = await getUserGroupMembers();
    if (groupMembers.size === 0) {
      console.log('⚠️  User group has no members. Exiting.');
      return;
    }
    
    // 3. Get users who have already responded
    const responders = await getThreadResponders(standupMessageTs);
    
    // 4. Find users who need reminders (in group but haven't responded)
    const usersToRemind = [...groupMembers].filter(userId => !responders.has(userId));
    
    console.log(`📊 Summary:`);
    console.log(`   Group members: ${groupMembers.size}`);
    console.log(`   Already responded: ${responders.size}`);
    console.log(`   Need reminder: ${usersToRemind.length}`);
    
    // 5. Send reminders
    await sendReminders(standupMessageTs, usersToRemind);
    
    console.log('✅ Reminder process completed successfully');
  } catch (error) {
    console.error('❌ Fatal error in reminder process:', error);
    process.exit(1);
  }
}

// Validate required environment variables
const requiredEnvVars = {
  'SLACK_BOT_TOKEN': process.env.SLACK_BOT_TOKEN,
  'CHANNEL_ID': process.env.CHANNEL_ID,
  'USERGROUP_ID': process.env.USERGROUP_ID
};

const missingVars = Object.entries(requiredEnvVars)
  .filter(([name, value]) => !value)
  .map(([name]) => name);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(name => console.error(`   - ${name}`));
  console.error('\nOptional environment variables:');
  console.error('   - SLACK_USER_TOKEN (recommended for user group access)');
  console.error('   - STANDUP_KEYWORDS (default: "standup,стендап,daily")');
  console.error('   - REMINDER_TEXT (default: "Напоминание: не забыли отписаться в стендапе до 13:00?")');
  process.exit(1);
}

// Warn if user token is not provided
if (!process.env.SLACK_USER_TOKEN) {
  console.warn('⚠️  Warning: SLACK_USER_TOKEN not provided.');
  console.warn('   The bot will attempt to use SLACK_BOT_TOKEN for user group access,');
  console.warn('   but this may fail depending on your workspace settings.');
  console.warn('   If you see errors, please provide a user token with usergroups:read scope.');
}

console.log('\n📋 Configuration:');
console.log(`   Channel: ${channel}`);
console.log(`   User Group: ${userGroupId}`);
console.log(`   Keywords: ${standupKeywords.join(', ')}`);
console.log(`   Looking for Workflow Builder posts with these keywords\n`);

// Run the main function
await main();
