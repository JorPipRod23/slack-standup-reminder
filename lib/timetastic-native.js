import https from 'https';
import NodeCache from 'node-cache';

// Cache for 1 hour to avoid hitting rate limits
const cache = new NodeCache({ stdTTL: 3600 });

class TimetasticAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.hostname = 'app.timetastic.co.uk';
    
    // Rate limiting: max 60 requests per minute
    this.requestCount = 0;
    this.requestResetTime = Date.now() + 60000;
  }

  /**
   * Make HTTPS request to Timetastic API
   */
  async makeRequest(path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.hostname,
        port: 443,
        path: `/api${path}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json'
        }
      };

      https.get(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`API returned status ${res.statusCode}: ${data.substring(0, 200)}`));
            return;
          }
          
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        });
      }).on('error', (e) => {
        reject(e);
      });
    });
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
    
    if (this.requestCount >= 60) {
      const waitTime = this.requestResetTime - now;
      console.log(`⏳ Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`);
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
      const users = await this.makeRequest('/users');
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
      const response = await this.makeRequest(`/holidays?start=${dateStr}&end=${dateStr}`);
      const absences = response.holidays || [];
      cache.set(cacheKey, absences, 1800); // Cache for 30 minutes for absences
      console.log(`✅ Found ${absences.length} absences for today`);
      return absences;
    } catch (error) {
      console.error('❌ Error fetching absences:', error.message);
      return null; // Return null to indicate API failure
    }
  }

  /**
   * Check if user is working today based on their email or name
   */
  async isUserWorking(userEmail, userName = null) {
    if (!userEmail && !userName) return { working: true, reason: 'no_identification' };

    try {
      // Get all users to map email/name to user ID
      const users = await this.getUsers();
      
      // Try to find user by email first
      let user = null;
      if (userEmail) {
        user = users.find(u => 
          u.email?.toLowerCase() === userEmail.toLowerCase()
        );
        
        if (user) {
          console.log(`   Found user by email: ${user.firstname} ${user.surname}`);
        }
      }
      
      // If not found by email, try by name (with fuzzy matching for typos)
      if (!user && userName) {
        const nameParts = userName.toLowerCase().split(' ');
        
        // Try exact match first
        user = users.find(u => {
          const fullName = `${u.firstname} ${u.surname}`.toLowerCase();
          return nameParts.every(part => fullName.includes(part));
        });
        
        // If not found, try fuzzy match (for Bogatyrkova vs Bogatyreva)
        if (!user) {
          user = users.find(u => {
            const firstName = u.firstname?.toLowerCase() || '';
            const lastName = u.surname?.toLowerCase() || '';
            const userFirstName = nameParts[0] || '';
            const userLastName = nameParts[1] || '';
            
            // Check if first name matches and last name is similar
            return firstName.includes(userFirstName) && 
                   (lastName.includes(userLastName.substring(0, 6)) || // Match first 6 chars of last name
                    userLastName.includes(lastName.substring(0, 6)));
          });
        }
        
        if (user) {
          console.log(`   Found user by name: ${user.firstname} ${user.surname} (for ${userName})`);
        }
      }
      
      if (!user) {
        console.log(`⚠️  User not found in Timetastic: ${userEmail || userName}`);
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
        a.userId == user.id // Note: using == for type coercion
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
      if (!absences) return null;
      
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
