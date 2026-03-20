/**
 * Task Scheduler for background operations
 * Provides robust scheduling with Chrome Alarms API integration
 */
class TaskScheduler {
  constructor() {
    this.alarms = new Map();
    this.isInitialized = false;
    this.taskQueue = [];
    this.maxRetries = 3;
    this.retryDelays = [1000, 5000, 15000]; // Progressive retry delays
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // Set up alarm listener
      chrome.alarms.onAlarm.addListener((alarm) => {
        this.handleAlarm(alarm);
      });
      
      this.isInitialized = true;
      console.log('Task Scheduler initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Task Scheduler:', error);
      throw error;
    }
  }

  async scheduleTask(taskId, options = {}) {
    const {
      delayInMinutes = 0,
      periodInMinutes = null,
      data = {},
      priority = 'normal',
      retries = this.maxRetries
    } = options;

    const alarmName = `task-${taskId}`;
    
    try {
      const alarmInfo = {
        delayInMinutes
      };
      
      if (periodInMinutes) {
        alarmInfo.periodInMinutes = periodInMinutes;
      }

      await chrome.alarms.create(alarmName, alarmInfo);
      
      this.alarms.set(alarmName, {
        taskId,
        data,
        priority,
        retries,
        scheduledAt: Date.now(),
        periodInMinutes
      });
      
      console.log(`Task scheduled: ${taskId} in ${delayInMinutes} minutes`);
      return { success: true, taskId, alarmName };
    } catch (error) {
      console.error(`Failed to schedule task ${taskId}:`, error);
      throw error;
    }
  }

  async handleAlarm(alarm) {
    const taskInfo = this.alarms.get(alarm.name);
    if (!taskInfo) {
      console.warn(`No task info found for alarm: ${alarm.name}`);
      return;
    }

    const { taskId, data, retries, periodInMinutes } = taskInfo;
    
    try {
      console.log(`Executing scheduled task: ${taskId}`);
      
      // Execute task logic - emit event to event bus
      if (this.eventBus) {
        await this.eventBus.emit('task:execute', {
          taskId,
          data,
          timestamp: Date.now()
        });
      }
      
      // If it's a recurring task, keep the alarm info
      if (!periodInMinutes) {
        this.alarms.delete(alarm.name);
      }
      
    } catch (error) {
      console.error(`Task execution failed: ${taskId}`, error);
      
      // Retry logic
      if (retries > 0) {
        taskInfo.retries = retries - 1;
        const retryDelay = this.retryDelays[this.maxRetries - retries - 1] || 30000;
        
        console.log(`Retrying task ${taskId} in ${retryDelay}ms (${retries} retries left)`);
        
        // Schedule retry
        setTimeout(async () => {
          await this.handleAlarm(alarm);
        }, retryDelay);
      } else {
        console.error(`Task ${taskId} failed after all retries`);
        this.alarms.delete(alarm.name);
        
        // Emit failure event
        if (this.eventBus) {
          await this.eventBus.emit('task:failed', {
            taskId,
            data,
            error: error.message,
            timestamp: Date.now()
          });
        }
      }
    }
  }

  async cancelTask(taskId) {
    const alarmName = `task-${taskId}`;
    
    try {
      await chrome.alarms.clear(alarmName);
      this.alarms.delete(alarmName);
      console.log(`Task cancelled: ${taskId}`);
      return { success: true, taskId };
    } catch (error) {
      console.error(`Failed to cancel task ${taskId}:`, error);
      throw error;
    }
  }

  async getScheduledTasks() {
    return Array.from(this.alarms.entries()).map(([name, info]) => ({
      alarmName: name,
      ...info
    }));
  }

  async getTaskStatus(taskId) {
    const alarmName = `task-${taskId}`;
    const taskInfo = this.alarms.get(alarmName);
    
    if (!taskInfo) {
      return { status: 'not_found' };
    }
    
    return {
      status: 'scheduled',
      ...taskInfo
    };
  }

  async clearAllTasks() {
    try {
      await chrome.alarms.clearAll();
      this.alarms.clear();
      console.log('All scheduled tasks cleared');
      return { success: true };
    } catch (error) {
      console.error('Failed to clear all tasks:', error);
      throw error;
    }
  }

  setEventBus(eventBus) {
    this.eventBus = eventBus;
  }

  // Performance monitoring
  getTaskStatistics() {
    const stats = {
      totalScheduled: this.alarms.size,
      byPriority: {
        high: 0,
        normal: 0,
        low: 0
      },
      recurringTasks: 0
    };

    for (const taskInfo of this.alarms.values()) {
      stats.byPriority[taskInfo.priority] = (stats.byPriority[taskInfo.priority] || 0) + 1;
      if (taskInfo.periodInMinutes) {
        stats.recurringTasks++;
      }
    }

    return stats;
  }
}

export { TaskScheduler };
