import { WebClient } from '@slack/web-api';
import TimetasticAPI from '../lib/timetastic.js';
import UKHolidayChecker from '../lib/holidays.js';

// Initialize Slack clients
const botClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const userClient = new WebClient(process.env.SLACK_USER_TOKEN);

// Initialize integrations
const timetastic = process.env.TIMETASTIC_API_KEY ? 
  new TimetasticAPI(process.env.TIMETASTIC_API_KEY) : null;
const holidayChecker = new UKHolidayChecker();

// Configuration from environment variables
const channel = process.env.CHANNEL_ID;
const userGroupId = process.env.USERGROUP_ID;
const standupKeywords = (process.env.STANDUP_KEYWORDS || 'standup,стендап,daily').toLowerCase().split(',');
const reminderText = process.env.REMINDER_TEXT || 'Коллеги, напоминаю про стендап! Пожалуйста, отпишитесь в треде до 13:00 📝';

// Tracking for skipped users
const skippedUsers = {
  holiday: [],
  sickLeave: [],
  dayOff: [],
  noEmail: [],
  apiError: []
};

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
    const history = await botClient.conversations.history({
      channel: channel,
      limit: 100
    });
    
    const standupMessage = (history.messages || []).find(message => {
      const timestampSeconds = Number((message.ts || '0').split('.')[0]);
      if (!isToday(timestampSeconds)) return false;
      
      const isFromWorkflow = message.bot_id && (!message.subtype || message.subtype === 'bot_message');
      if (!isFromWorkflow) return false;
      
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
 * Get Slack users with their emails
 */
async function getSlackUsersWithEmails() {
  try {
    const result = await botClient.users.list({ limit: 1000 });
    const emailMap = {};
    const nameMap = {};
    
    (result.members || []).forEach(user => {
      if (user.id && !user.deleted && !user.is_bot) {
        emailMap[user.id] = user.profile?.email || null;
        nameMap[user.id] = user.real_name || user.name || user.id;
      }
    });
    
    console.log(`✅ Loaded ${Object.keys(emailMap).length} Slack users with emails`);
    return { emailMap, nameMap };
  } catch (error) {
    console.error('❌ Error fetching Slack users:', error.message);
    return { emailMap: {}, nameMap: {} };
  }
}

/**
 * Get members of the specified user group
 */
async function getUserGroupMembers() {
  try {
    const result = await userClient.usergroups.users.list({
      usergroup: userGroupId
    });
    
    const members = result.users || [];
    console.log(`✅ Found ${members.length} members in user group ${userGroupId}`);
    return new Set(members);
  } catch (error) {
    console.error('❌ Error fetching user group members:', error.message);
    
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
      throw error;
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
      limit: 1000
    });
    
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
 * Filter users based on Timetastic status
 */
async function filterWorkingUsers(userIds, emailMap, nameMap) {
  if (!timetastic) {
    console.log('⚠️  Timetastic integration not configured, skipping leave checks');
    return userIds;
  }

  console.log('\n📋 Checking Timetastic leave status...');
  
  // Get today's leave summary
  const leaveSummary = await timetastic.getLeaveSummary();
  if (leaveSummary) {
    console.log(`   Total absences today: ${leaveSummary.total}`);
    Object.entries(leaveSummary.byType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });
  }

  const workingUsers = [];
  
  for (const userId of userIds) {
    const email = emailMap[userId];
    const name = nameMap[userId] || userId;
    
    if (!email) {
      console.log(`   ⚠️  No email for ${name}, including in reminders`);
      skippedUsers.noEmail.push(name);
      workingUsers.push(userId);
      continue;
    }

    const status = await timetastic.isUserWorking(email);
    
    if (status.working) {
      workingUsers.push(userId);
      if (status.reason === 'working_remotely') {
        console.log(`   ✅ ${name} is working (${status.leaveType})`);
      }
    } else {
      // User is not working, skip them
      const skipReason = status.leaveType || status.reason;
      console.log(`   🏖️  Skipping ${name}: ${skipReason}`);
      
      // Categorize skipped users
      if (skipReason.toLowerCase().includes('holiday')) {
        skippedUsers.holiday.push(name);
      } else if (skipReason.toLowerCase().includes('sick')) {
        skippedUsers.sickLeave.push(name);
      } else if (skipReason.toLowerCase().includes('day off')) {
        skippedUsers.dayOff.push(name);
      }
    }
  }

  return workingUsers;
}

/**
 * Send reminder messages to users who haven't responded
 */
async function sendReminders(threadTs, usersToRemind) {
  if (usersToRemind.length === 0) {
    await botClient.chat.postMessage({
      channel: channel,
      thread_ts: threadTs,
      text: '✅ Все участники группы (кто сегодня работает) уже отписались в стендапе! 👍'
    });
    console.log('✅ All working group members have responded');
    return;
  }
  
  console.log(`\n📢 Sending reminders to ${usersToRemind.length} users`);
  
  const batchSize = 20;
  for (let i = 0; i < usersToRemind.length; i += batchSize) {
    const batch = usersToRemind.slice(i, i + batchSize);
    const mentions = batch.map(userId => `<@${userId}>`).join(' ');
    
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
 * Log summary of skipped users
 */
function logSkippedUsersSummary() {
  console.log('\n📊 Skipped Users Summary:');
  
  if (skippedUsers.holiday.length > 0) {
    console.log(`   🏖️  On Holiday (${skippedUsers.holiday.length}): ${skippedUsers.holiday.join(', ')}`);
  }
  if (skippedUsers.sickLeave.length > 0) {
    console.log(`   🤒 Sick Leave (${skippedUsers.sickLeave.length}): ${skippedUsers.sickLeave.join(', ')}`);
  }
  if (skippedUsers.dayOff.length > 0) {
    console.log(`   📅 Day Off (${skippedUsers.dayOff.length}): ${skippedUsers.dayOff.join(', ')}`);
  }
  if (skippedUsers.noEmail.length > 0) {
    console.log(`   📧 No Email (${skippedUsers.noEmail.length}): ${skippedUsers.noEmail.join(', ')}`);
  }
  
  const totalSkipped = Object.values(skippedUsers).reduce((sum, arr) => sum + arr.length, 0);
  if (totalSkipped === 0) {
    console.log('   No users were skipped');
  } else {
    console.log(`   Total skipped: ${totalSkipped}`);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🚀 Starting enhanced standup reminder process...');
    console.log(`   Channel: ${channel}`);
    console.log(`   User Group: ${userGroupId}`);
    console.log(`   Timetastic: ${timetastic ? 'Enabled' : 'Disabled'}`);
    
    // 1. Check if today is a UK holiday
    const holidayStatus = await holidayChecker.isHolidayToday();
    if (holidayStatus.isHoliday) {
      console.log(`\n🎉 Today is a UK Bank Holiday: ${holidayStatus.name}`);
      console.log('   Skipping standup reminders for today.');
      
      // Optionally, get next holiday info
      const nextHoliday = await holidayChecker.getNextHoliday();
      if (nextHoliday) {
        console.log(`   Next holiday: ${nextHoliday.name} in ${nextHoliday.daysUntil} days`);
      }
      
      return;
    }
    
    // 2. Find today's standup message
    const standupMessageTs = await findTodayStandupMessage();
    if (!standupMessageTs) {
      console.log('⚠️  No standup message found for today. Exiting.');
      return;
    }
    
    // 3. Get Slack users with emails
    const { emailMap, nameMap } = await getSlackUsersWithEmails();
    
    // 4. Get members of the user group
    const groupMembers = await getUserGroupMembers();
    if (groupMembers.size === 0) {
      console.log('⚠️  User group has no members. Exiting.');
      return;
    }
    
    // 5. Get users who have already responded
    const responders = await getThreadResponders(standupMessageTs);
    
    // 6. Find users who need reminders (in group but haven't responded)
    const needReminderIds = [...groupMembers].filter(userId => !responders.has(userId));
    
    console.log(`\n📊 Initial Summary:`);
    console.log(`   Group members: ${groupMembers.size}`);
    console.log(`   Already responded: ${responders.size}`);
    console.log(`   Need reminder (before filtering): ${needReminderIds.length}`);
    
    // 7. Filter out users who are not working today
    const workingUsersToRemind = await filterWorkingUsers(needReminderIds, emailMap, nameMap);
    
    console.log(`   Need reminder (after filtering): ${workingUsersToRemind.length}`);
    
    // 8. Send reminders
    await sendReminders(standupMessageTs, workingUsersToRemind);
    
    // 9. Log summary of skipped users
    logSkippedUsersSummary();
    
    console.log('\n✅ Enhanced reminder process completed successfully');
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
  console.error('   - TIMETASTIC_API_KEY (for leave management integration)');
  console.error('   - STANDUP_KEYWORDS (default: "standup,стендап,daily")');
  console.error('   - REMINDER_TEXT (default: "Коллеги, напоминаю про стендап! Пожалуйста, отпишитесь в треде до 13:00 📝")');
  process.exit(1);
}

// Warn if user token is not provided
if (!process.env.SLACK_USER_TOKEN) {
  console.warn('⚠️  Warning: SLACK_USER_TOKEN not provided.');
  console.warn('   The bot will attempt to use SLACK_BOT_TOKEN for user group access,');
  console.warn('   but this may fail depending on your workspace settings.');
}

// Info about Timetastic integration
if (!process.env.TIMETASTIC_API_KEY) {
  console.log('ℹ️  Timetastic integration disabled (no API key provided)');
  console.log('   Bot will remind all users who haven\'t responded, regardless of leave status');
} else {
  console.log('✅ Timetastic integration enabled');
}

console.log('');

// Run the main function
await main();
