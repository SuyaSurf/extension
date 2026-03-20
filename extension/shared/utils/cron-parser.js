/**
 * Cron Expression Parser
 * Supports standard cron expressions with 5 fields
 * Format: * * * * *
 * Minute Hour DayOfMonth Month DayOfWeek
 */

class CronParser {
  constructor() {
    this.fields = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];
    this.monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    this.dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  }

  /**
   * Parse a cron expression and return next execution times
   * @param {string} cronExpression - Cron expression (e.g., "0 12 * * *")
   * @param {Date} fromDate - Date to calculate from (default: now)
   * @param {number} count - Number of next execution times to return
   * @returns {Array<Date>} Array of next execution times
   */
  getNextExecutions(cronExpression, fromDate = new Date(), count = 5) {
    try {
      const parsed = this.parseExpression(cronExpression);
      const executions = [];
      let currentDate = new Date(fromDate);

      // Move to next minute to avoid executing immediately
      currentDate.setMinutes(currentDate.getMinutes() + 1);
      currentDate.setSeconds(0);
      currentDate.setMilliseconds(0);

      while (executions.length < count && executions.length < 100) {
        if (this.matchesSchedule(currentDate, parsed)) {
          executions.push(new Date(currentDate));
        }
        
        // Increment by minute
        currentDate = new Date(currentDate.getTime() + 60000);
      }

      return executions;
    } catch (error) {
      console.error('Error parsing cron expression:', error);
      return [];
    }
  }

  /**
   * Parse cron expression into structured format
   * @param {string} expression - Cron expression
   * @returns {Object} Parsed schedule object
   */
  parseExpression(expression) {
    const parts = expression.trim().split(/\s+/);
    
    if (parts.length !== 5) {
      throw new Error('Invalid cron expression: must have 5 fields');
    }

    const schedule = {};
    
    schedule.minute = this.parseField(parts[0], 0, 59);
    schedule.hour = this.parseField(parts[1], 0, 23);
    schedule.dayOfMonth = this.parseField(parts[2], 1, 31);
    schedule.month = this.parseField(parts[3], 1, 12);
    schedule.dayOfWeek = this.parseField(parts[4], 0, 6);

    return schedule;
  }

  /**
   * Parse individual field of cron expression
   * @param {string} field - Field value
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {Object} Parsed field with ranges, values, and step
   */
  parseField(field, min, max) {
    const result = {
      type: 'specific',
      values: [],
      ranges: [],
      step: 1
    };

    // Handle step expressions (e.g., */5, 1-10/2)
    let stepMatch = field.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      result.step = parseInt(stepMatch[2]);
      field = stepMatch[1];
    }

    // Handle ranges (e.g., 1-5)
    if (field.includes('-')) {
      const rangeParts = field.split('-');
      if (rangeParts.length === 2) {
        const start = this.parseValue(rangeParts[0], min, max);
        const end = this.parseValue(rangeParts[1], min, max);
        result.ranges = [{ start, end }];
        result.type = 'range';
      }
    }
    // Handle lists (e.g., 1,3,5)
    else if (field.includes(',')) {
      const values = field.split(',').map(v => this.parseValue(v, min, max));
      result.values = values;
      result.type = 'list';
    }
    // Handle wildcard
    else if (field === '*') {
      result.type = 'wildcard';
      result.values = Array.from({ length: max - min + 1 }, (_, i) => i + min);
    }
    // Handle single value
    else {
      const value = this.parseValue(field, min, max);
      result.values = [value];
      result.type = 'specific';
    }

    return result;
  }

  /**
   * Parse individual value, handling names for months and days
   * @param {string} value - Value to parse
   * @param {number} min - Minimum allowed value
   * @param {number} max - Maximum allowed value
   * @returns {number} Parsed numeric value
   */
  parseValue(value, min, max) {
    const lowerValue = value.toLowerCase();
    
    // Handle month names
    if (min === 1 && max === 12) {
      const monthIndex = this.monthNames.indexOf(lowerValue);
      if (monthIndex !== -1) {
        return monthIndex + 1;
      }
    }
    
    // Handle day names
    if (min === 0 && max === 6) {
      const dayIndex = this.dayNames.indexOf(lowerValue);
      if (dayIndex !== -1) {
        return dayIndex;
      }
    }
    
    const numValue = parseInt(value);
    if (isNaN(numValue) || numValue < min || numValue > max) {
      throw new Error(`Invalid value ${value} for range ${min}-${max}`);
    }
    
    return numValue;
  }

  /**
   * Check if a date matches the parsed cron schedule
   * @param {Date} date - Date to check
   * @param {Object} schedule - Parsed schedule
   * @returns {boolean} Whether date matches schedule
   */
  matchesSchedule(date, schedule) {
    return this.matchesField(date.getMinutes(), schedule.minute) &&
           this.matchesField(date.getHours(), schedule.hour) &&
           this.matchesField(date.getDate(), schedule.dayOfMonth) &&
           this.matchesField(date.getMonth() + 1, schedule.month) &&
           this.matchesField(date.getDay(), schedule.dayOfWeek);
  }

  /**
   * Check if value matches field specification
   * @param {number} value - Value to check
   * @param {Object} field - Field specification
   * @returns {boolean} Whether value matches
   */
  matchesField(value, field) {
    switch (field.type) {
      case 'wildcard':
        return true;
        
      case 'specific':
      case 'list':
        return field.values.includes(value);
        
      case 'range':
        for (const range of field.ranges) {
          if (value >= range.start && value <= range.end) {
            // Check step
            const offset = value - range.start;
            if (offset % field.step === 0) {
              return true;
            }
          }
        }
        return false;
        
      default:
        return false;
    }
  }

  /**
   * Get human-readable description of cron expression
   * @param {string} expression - Cron expression
   * @returns {string} Human-readable description
   */
  getDescription(expression) {
    try {
      const parsed = this.parseExpression(expression);
      const descriptions = [];

      if (parsed.minute.type === 'specific' && parsed.minute.values.length === 1) {
        descriptions.push(`at minute ${parsed.minute.values[0]}`);
      } else if (parsed.minute.type === 'wildcard') {
        descriptions.push('every minute');
      }

      if (parsed.hour.type === 'specific' && parsed.hour.values.length === 1) {
        descriptions.push(`at hour ${parsed.hour.values[0]}`);
      } else if (parsed.hour.type === 'wildcard') {
        descriptions.push('every hour');
      }

      if (parsed.dayOfMonth.type === 'specific' && parsed.dayOfMonth.values.length === 1) {
        descriptions.push(`on day ${parsed.dayOfMonth.values[0]}`);
      } else if (parsed.dayOfMonth.type === 'wildcard') {
        descriptions.push('every day');
      }

      if (parsed.month.type === 'specific' && parsed.month.values.length === 1) {
        descriptions.push(`in month ${parsed.month.values[0]}`);
      } else if (parsed.month.type === 'wildcard') {
        descriptions.push('every month');
      }

      if (parsed.dayOfWeek.type === 'specific' && parsed.dayOfWeek.values.length === 1) {
        descriptions.push(`on ${this.dayNames[parsed.dayOfWeek.values[0]]}`);
      } else if (parsed.dayOfWeek.type === 'wildcard') {
        descriptions.push('any day of week');
      }

      return descriptions.join(' ');
    } catch (error) {
      return `Invalid cron expression: ${expression}`;
    }
  }

  /**
   * Validate cron expression syntax
   * @param {string} expression - Cron expression to validate
   * @returns {boolean} Whether expression is valid
   */
  isValid(expression) {
    try {
      this.parseExpression(expression);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get common cron presets
   * @returns {Object} Common presets with descriptions
   */
  getPresets() {
    return {
      '@yearly': {
        expression: '0 0 1 1 *',
        description: 'Run once a year at midnight on Jan 1st'
      },
      '@monthly': {
        expression: '0 0 1 * *',
        description: 'Run once a month at midnight on the 1st'
      },
      '@weekly': {
        expression: '0 0 * * 0',
        description: 'Run once a week at midnight on Sunday'
      },
      '@daily': {
        expression: '0 0 * * *',
        description: 'Run once a day at midnight'
      },
      '@hourly': {
        expression: '0 * * * *',
        description: 'Run once an hour at the beginning of the hour'
      },
      '@every_30min': {
        expression: '*/30 * * * *',
        description: 'Run every 30 minutes'
      },
      '@every_15min': {
        expression: '*/15 * * * *',
        description: 'Run every 15 minutes'
      },
      '@every_5min': {
        expression: '*/5 * * * *',
        description: 'Run every 5 minutes'
      },
      '@business_hours': {
        expression: '0 9-17 * * 1-5',
        description: 'Run every hour during business hours (9 AM - 5 PM, Mon-Fri)'
      },
      '@weekend': {
        expression: '0 10 * * 6,0',
        description: 'Run at 10 AM on weekends'
      }
    };
  }

  /**
   * Expand preset aliases
   * @param {string} expression - Expression that might contain presets
   * @returns {string} Expanded expression
   */
  expandPresets(expression) {
    const presets = this.getPresets();
    
    if (presets[expression]) {
      return presets[expression].expression;
    }
    
    return expression;
  }
}

export { CronParser };
