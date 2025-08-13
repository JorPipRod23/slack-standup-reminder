import Holidays from 'date-holidays';
import NodeCache from 'node-cache';
import axios from 'axios';

// Cache for 24 hours for holidays
const cache = new NodeCache({ stdTTL: 86400 });

class UKHolidayChecker {
  constructor() {
    // Initialize with UK holidays for England and Wales
    this.holidays = new Holidays('GB', 'ENG');
    
    // Backup: UK Government API
    this.govAPIUrl = 'https://www.gov.uk/bank-holidays.json';
  }

  /**
   * Check if today is a UK bank holiday
   */
  async isHolidayToday() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    
    // Check cache first
    const cacheKey = `uk_holiday_${dateStr}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      console.log(`📦 Using cached holiday status for ${dateStr}: ${cached.isHoliday ? cached.name : 'Working day'}`);
      return cached;
    }

    // Try primary method: date-holidays library
    let result = await this.checkWithLibrary(today);
    
    // If no holiday found, double-check with government API
    if (!result.isHoliday) {
      const govResult = await this.checkWithGovAPI(dateStr);
      if (govResult.isHoliday) {
        result = govResult;
      }
    }

    // Cache the result
    cache.set(cacheKey, result);
    
    if (result.isHoliday) {
      console.log(`🎉 Today is a UK holiday: ${result.name}`);
    } else {
      console.log('📅 Today is a working day in the UK');
    }
    
    return result;
  }

  /**
   * Check using date-holidays library
   */
  async checkWithLibrary(date) {
    try {
      const holidaysToday = this.holidays.isHoliday(date);
      
      if (holidaysToday && holidaysToday.length > 0) {
        return {
          isHoliday: true,
          name: holidaysToday[0].name,
          type: holidaysToday[0].type
        };
      }
      
      return { isHoliday: false };
    } catch (error) {
      console.error('⚠️  Error checking holidays with library:', error.message);
      return { isHoliday: false };
    }
  }

  /**
   * Check using UK Government API as backup
   */
  async checkWithGovAPI(dateStr) {
    try {
      // Check cache for government holidays data
      const cacheKey = 'gov_holidays_data';
      let holidaysData = cache.get(cacheKey);
      
      if (!holidaysData) {
        console.log('📡 Fetching UK holidays from government API...');
        const response = await axios.get(this.govAPIUrl, { timeout: 5000 });
        holidaysData = response.data;
        cache.set(cacheKey, holidaysData, 86400); // Cache for 24 hours
      }

      // Check England and Wales holidays
      const englandWales = holidaysData['england-and-wales'];
      if (!englandWales || !englandWales.events) {
        return { isHoliday: false };
      }

      const holiday = englandWales.events.find(event => event.date === dateStr);
      
      if (holiday) {
        return {
          isHoliday: true,
          name: holiday.title,
          type: 'bank_holiday'
        };
      }

      return { isHoliday: false };
    } catch (error) {
      console.error('⚠️  Error checking government API:', error.message);
      // If API fails, don't block the bot
      return { isHoliday: false };
    }
  }

  /**
   * Get next UK holiday for informational purposes
   */
  async getNextHoliday() {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const allHolidays = this.holidays.getHolidays(year);
      
      const futureHolidays = allHolidays
        .filter(h => new Date(h.date) > today)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      
      if (futureHolidays.length > 0) {
        const next = futureHolidays[0];
        return {
          name: next.name,
          date: next.date,
          daysUntil: Math.ceil((new Date(next.date) - today) / (1000 * 60 * 60 * 24))
        };
      }
      
      return null;
    } catch (error) {
      console.error('⚠️  Error getting next holiday:', error.message);
      return null;
    }
  }

  /**
   * Get list of all UK holidays for the year
   */
  async getYearHolidays() {
    try {
      const year = new Date().getFullYear();
      const holidays = this.holidays.getHolidays(year);
      
      return holidays.map(h => ({
        name: h.name,
        date: h.date,
        type: h.type
      }));
    } catch (error) {
      console.error('⚠️  Error getting year holidays:', error.message);
      return [];
    }
  }
}

export default UKHolidayChecker;
