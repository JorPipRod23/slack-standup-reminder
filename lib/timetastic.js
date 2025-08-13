import axios from 'axios';
import NodeCache from 'node-cache';

// Cache for 1 hour to avoid hitting rate limits
const cache = new NodeCache({ stdTTL: 3600 });

class TimetasticAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://app.timetastic.co.uk/api';
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });
    
    // Rate limiting: max 60 requests per minute
    this.requestCount = 0;
    this.requestResetTime = Date.now() + 60000;
  }

  /**
   * Rate limit handler
   */
  async checkRateLimit() {
    const now = Date.now();
    if (now > this.requestResetTime) {
      this.requestCount = 0;
      this.requestResetTime = now + 60000;
    }
    
    if (this.requestCount >= 55) { // Leave buffer of 5 requests
      const waitTime = this.requestResetTime - now;
      console.log(`⏳ Rate limit approaching, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.requestResetTime = Date.now() + 60000;
    }
    
    this.requestCount++;
  }

  /**
   * Get all users from Timetastic
   */
  async getUsers() {
    const cacheKey = 'timetastic_users';
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log('📦 Using cached Timetastic users');
      return cached;
    }

    try {
      await this.checkRateLimit();
      const response = await this.axiosInstance.get('/users');
      const users = response.data;
      cache.set(cacheKey, users);
      console.log(`✅ Fetched ${users.length} users from Timetastic`);
      return users;
    } catch (error) {
      console.error('❌ Error fetching Timetastic users:', error.message);
      return [];
    }
  }

  /**
   * Get absences for today
   */
  async getTodayAbsences() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const cacheKey = `absences_${dateStr}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log('📦 Using cached absences for today');
      return cached;
    }

    try {
      await this.checkRateLimit();
      
      // Timetastic API expects dates in YYYY-MM-DD format
      const response = await this.axiosInstance.get('/holidays', {
        params: {
          Start: dateStr,
          End: dateStr
        }
      });
      
      // Timetastic returns data in 'holidays' property
      const absences = response.data?.holidays || response.data || [];
      cache.set(cacheKey, absences, 1800); // Cache for 30 minutes for absences
      console.log(`✅ Found ${absences.length} absences for today`);
      return absences;
    } catch (error) {
      console.error('❌ Error fetching absences:', error.message);
      return null; // Return null to indicate API failure
    }
  }

  /**
   * Check if user is working today based on their email
   */
  async isUserWorking(userEmail) {
    if (!userEmail) return { working: true, reason: 'no_email' };

    try {
      // Get all users to map email to user ID
      const users = await this.getUsers();
      const user = users.find(u => 
        u.email?.toLowerCase() === userEmail.toLowerCase()
      );
      
      if (!user) {
        console.log(`⚠️  User not found in Timetastic: ${userEmail}`);
        return { working: true, reason: 'not_in_timetastic' };
      }

      // Get today's absences
      const absences = await this.getTodayAbsences();
      
      if (absences === null) {
        // API failed, default to working
        return { working: true, reason: 'api_error' };
      }

      // Find if user has absence today
      const userAbsence = absences.find(a => 
        a.userId === user.id || 
        a.userName?.toLowerCase() === userEmail.toLowerCase()
      );

      if (!userAbsence) {
        return { working: true, reason: 'no_absence' };
      }

      // Check leave type - these types mean user is NOT working
      const nonWorkingTypes = [
        'Holiday',
        'Sick Leave', 
        'Day off'
      ];

      // Check if the leave type indicates non-working
      const leaveTypeName = userAbsence.leaveTypeName || userAbsence.leaveType || '';
      const isNonWorking = nonWorkingTypes.some(type => 
        leaveTypeName.toLowerCase().includes(type.toLowerCase())
      );

      if (isNonWorking) {
        return { 
          working: false, 
          reason: 'on_leave',
          leaveType: leaveTypeName,
          userName: user.firstname + ' ' + user.surname
        };
      }

      // User has some other type of leave (Remote, Office, etc.) - they're working
      return { 
        working: true, 
        reason: 'working_remotely',
        leaveType: leaveTypeName
      };

    } catch (error) {
      console.error(`❌ Error checking user status for ${userEmail}:`, error.message);
      // On error, default to working (fail open)
      return { working: true, reason: 'error' };
    }
  }

  /**
   * Get leave summary for logging
   */
  async getLeaveSummary() {
    try {
      const absences = await this.getTodayAbsences();
      if (!absences || !Array.isArray(absences)) return null;

      const summary = {
        total: absences.length,
        byType: {}
      };

      absences.forEach(absence => {
        const type = absence.leaveTypeName || absence.leaveType || 'Unknown';
        summary.byType[type] = (summary.byType[type] || 0) + 1;
      });

      return summary;
    } catch (error) {
      console.error('❌ Error getting leave summary:', error.message);
      return null;
    }
  }
}

export default TimetasticAPI;
