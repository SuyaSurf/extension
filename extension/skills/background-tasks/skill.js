/**
 * Background Tasks Skill
 * Handles task scheduling, chaining, and background processing
 */

import { CronParser } from '../../shared/utils/cron-parser.js';
import { HistoryManager } from '../../shared/utils/history-manager.js';
import { ReminderManager } from '../../shared/utils/reminder-manager.js';

class BackgroundTasksSkill {
  constructor(config = {}) {
    this.name = 'background-tasks';
    this.version = '1.0.0';
    this.isActive = false;
    this.config = {
      maxConcurrentTasks: 5,
      retryAttempts: 3,
      taskTimeout: 300000, // 5 minutes
      ...config
    };
    
    this.tasks = new Map();
    this.taskQueue = [];
    this.runningTasks = new Set();
    this.taskChains = new Map();
    this.scheduler = null;
    this.eventBus = null;
    this.storageManager = null;
    this.cronParser = new CronParser();
    this.scheduledTasks = new Map(); // For cron-based scheduling
    this.historyManager = new HistoryManager({
      maxEntries: 5000,
      retentionDays: 30
    });
    this.reminderManager = new ReminderManager({
      maxReminders: 500,
      enableNotifications: true,
      enableSounds: true
    });
    
    this.taskStats = {
      total: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      running: 0
    };
  }

  async initialize() {
    console.log('Initializing Background Tasks Skill...');
    
    // Load existing tasks from storage
    await this.loadTasksFromStorage();
    
    // Load scheduled cron tasks
    await this.loadScheduledTasksFromStorage();
    
    // Initialize history manager
    await this.historyManager.initialize(this.storageManager);
    this.historyManager.setEventBus(this.eventBus);
    
    // Initialize reminder manager
    await this.reminderManager.initialize(this.storageManager, this.eventBus);
    
    // Set up task scheduler
    this.setupTaskScheduler();
    
    // Set up cron alarm handler
    this.setupCronAlarmHandler();
    
    // Clean up old tasks
    await this.cleanupOldTasks();
    
    console.log('Background Tasks Skill initialized');
  }

  async activate() {
    if (this.isActive) return;
    
    this.isActive = true;
    console.log('Background Tasks Skill activated');
    
    // Resume pending tasks
    await this.resumePendingTasks();
  }

  async deactivate() {
    if (!this.isActive) return;
    
    this.isActive = false;
    console.log('Background Tasks Skill deactivated');
    
    // Pause running tasks (graceful shutdown)
    await this.pauseRunningTasks();
  }

  setupTaskScheduler() {
    // Set up periodic task processing
    setInterval(() => {
      if (this.isActive) {
        this.processTaskQueue();
      }
    }, 1000); // Process queue every second
  }

  async handleAction(action, data, sender = null) {
    switch (action) {
      case 'createTask':
        return await this.createTask(data);
        
      case 'getTask':
        return await this.getTask(data.taskId);
        
      case 'updateTask':
        return await this.updateTask(data.taskId, data.updates);
        
      case 'cancelTask':
        return await this.cancelTask(data.taskId);
        
      case 'retryTask':
        return await this.retryTask(data.taskId);
        
      case 'listTasks':
        return await this.listTasks(data.filters || {});
        
      case 'createTaskChain':
        return await this.createTaskChain(data);
        
      case 'getTaskStats':
        return this.getTaskStats();
        
      case 'clearCompletedTasks':
        return await this.clearCompletedTasks();
        
      case 'scheduleCronTask':
        return await this.scheduleCronTask(data);
        
      case 'unscheduleCronTask':
        return await this.unscheduleCronTask(data.taskId);
        
      case 'getCronTasks':
        return await this.getCronTasks();
        
      case 'validateCronExpression':
        return this.validateCronExpression(data.expression);
        
      case 'getCronPresets':
        return this.getCronPresets();
        
      case 'getNextCronExecutions':
        return this.getNextCronExecutions(data.expression, data.fromDate, data.count);
        
      case 'getHistory':
        return await this.getHistory(data.query);
        
      case 'getHistoryAnalytics':
        return await this.getHistoryAnalytics(data.options);
        
      case 'exportHistory':
        return this.exportHistory(data.options);
        
      case 'clearHistory':
        return await this.clearHistory(data.filter);
        
      case 'searchHistory':
        return await this.searchHistory(data.query);
        
      case 'createReminder':
        return await this.createReminder(data);
        
      case 'updateReminder':
        return await this.updateReminder(data.reminderId, data.updates);
        
      case 'deleteReminder':
        return await this.deleteReminder(data.reminderId);
        
      case 'getReminders':
        return this.getReminders(data.filter);
        
      case 'getReminderStats':
        return this.getReminderStats();
        
      case 'snoozeReminder':
        return await this.snoozeReminder(data.reminderId, data.minutes);
        
      case 'dismissReminder':
        return await this.dismissReminder(data.reminderId);
        
      case 'getReminderCategories':
        return this.getReminderCategories();
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async handleSkillMessage(fromSkill, message, context) {
    switch (message.type) {
      case 'task-request':
        return await this.createTask({
          skill: fromSkill,
          action: message.action,
          data: message.data,
          priority: message.priority || 'normal'
        });
        
      case 'task-status-request':
        return await this.getTask(message.taskId);
        
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  async createTask(taskData) {
    const task = {
      id: crypto.randomUUID(),
      skill: taskData.skill || 'unknown',
      action: taskData.action,
      data: taskData.data || {},
      status: 'pending',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      retryCount: 0,
      maxRetries: taskData.maxRetries || this.config.retryAttempts,
      priority: taskData.priority || 'normal',
      timeout: taskData.timeout || this.config.taskTimeout,
      dependencies: taskData.dependencies || [],
      chainId: taskData.chainId || null
    };
    
    // Store task
    this.tasks.set(task.id, task);
    await this.saveTaskToStorage(task);
    
    // Add to queue
    this.addToTaskQueue(task);
    
    // Update stats
    this.taskStats.total++;
    
    // Log to history
    await this.logHistoryEvent('task', 'created', task, 'info', ['task']);
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('task-created', { task });
    }
    
    console.log(`Task created: ${task.id}`);
    return task;
  }

  async getTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  async updateTask(taskId, updates) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    Object.assign(task, updates);
    await this.saveTaskToStorage(task);
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('task-updated', { task, updates });
    }
    
    return task;
  }

  async cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    if (task.status === 'running') {
      // Cancel running task
      await this.cancelRunningTask(task);
    } else if (task.status === 'pending') {
      // Remove from queue
      this.removeFromTaskQueue(taskId);
    }
    
    task.status = 'cancelled';
    task.completedAt = Date.now();
    await this.saveTaskToStorage(task);
    
    // Update stats
    this.taskStats.cancelled++;
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('task-cancelled', { task });
    }
    
    console.log(`Task cancelled: ${taskId}`);
    return task;
  }

  async retryTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    if (task.status !== 'failed') {
      throw new Error(`Cannot retry task with status: ${task.status}`);
    }
    
    task.status = 'pending';
    task.error = null;
    task.retryCount++;
    task.startedAt = null;
    
    await this.saveTaskToStorage(task);
    this.addToTaskQueue(task);
    
    console.log(`Task retry scheduled: ${taskId}`);
    return task;
  }

  async listTasks(filters = {}) {
    let tasks = Array.from(this.tasks.values());
    
    // Apply filters
    if (filters.status) {
      tasks = tasks.filter(task => task.status === filters.status);
    }
    
    if (filters.skill) {
      tasks = tasks.filter(task => task.skill === filters.skill);
    }
    
    if (filters.priority) {
      tasks = tasks.filter(task => task.priority === filters.priority);
    }
    
    if (filters.createdAfter) {
      tasks = tasks.filter(task => task.createdAt > filters.createdAfter);
    }
    
    if (filters.createdBefore) {
      tasks = tasks.filter(task => task.createdAt < filters.createdBefore);
    }
    
    // Sort by creation time (newest first)
    tasks.sort((a, b) => b.createdAt - a.createdAt);
    
    // Apply limit
    if (filters.limit) {
      tasks = tasks.slice(0, filters.limit);
    }
    
    return tasks;
  }

  async createTaskChain(chainData) {
    const chain = {
      id: crypto.randomUUID(),
      name: chainData.name || `Chain ${Date.now()}`,
      tasks: chainData.tasks || [],
      status: 'pending',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      currentTaskIndex: 0,
      onFailure: chainData.onFailure || 'stop', // 'stop' or 'continue'
      onTaskFailure: chainData.onTaskFailure || 'stop'
    };
    
    this.taskChains.set(chain.id, chain);
    
    // Create tasks in chain
    const taskIds = [];
    for (let i = 0; i < chain.tasks.length; i++) {
      const taskData = chain.tasks[i];
      const task = await this.createTask({
        ...taskData,
        chainId: chain.id,
        dependencies: i > 0 ? [taskIds[i - 1]] : []
      });
      taskIds.push(task.id);
    }
    
    // Update chain with task IDs
    chain.taskIds = taskIds;
    await this.saveTaskChainToStorage(chain);
    
    console.log(`Task chain created: ${chain.id}`);
    return chain;
  }

  addToTaskQueue(task) {
    // Insert task based on priority
    const priorityOrder = { 'high': 0, 'normal': 1, 'low': 2 };
    const taskPriority = priorityOrder[task.priority] || 1;
    
    let insertIndex = this.taskQueue.length;
    for (let i = 0; i < this.taskQueue.length; i++) {
      const queuedTask = this.taskQueue[i];
      const queuedPriority = priorityOrder[queuedTask.priority] || 1;
      
      if (taskPriority < queuedPriority) {
        insertIndex = i;
        break;
      }
    }
    
    this.taskQueue.splice(insertIndex, 0, task.id);
  }

  removeFromTaskQueue(taskId) {
    const index = this.taskQueue.indexOf(taskId);
    if (index !== -1) {
      this.taskQueue.splice(index, 1);
    }
  }

  async processTaskQueue() {
    // Check if we can run more tasks
    if (this.runningTasks.size >= this.config.maxConcurrentTasks) {
      return;
    }
    
    // Process queue
    while (this.taskQueue.length > 0 && this.runningTasks.size < this.config.maxConcurrentTasks) {
      const taskId = this.taskQueue.shift();
      const task = this.tasks.get(taskId);
      
      if (!task || task.status !== 'pending') {
        continue;
      }
      
      // Check dependencies
      if (!await this.checkTaskDependencies(task)) {
        // Re-add to queue for later
        this.taskQueue.push(taskId);
        continue;
      }
      
      // Execute task
      this.executeTask(task);
    }
  }

  async checkTaskDependencies(task) {
    for (const depId of task.dependencies) {
      const depTask = this.tasks.get(depId);
      if (!depTask || depTask.status !== 'completed') {
        return false;
      }
    }
    return true;
  }

  async executeTask(task) {
    task.status = 'running';
    task.startedAt = Date.now();
    await this.saveTaskToStorage(task);
    
    this.runningTasks.add(task.id);
    this.taskStats.running++;
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('task-started', { task });
    }
    
    console.log(`Task started: ${task.id}`);
    
    try {
      // Set timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Task timeout')), task.timeout);
      });
      
      // Execute task
      const executionPromise = this.executeTaskAction(task);
      
      // Race between execution and timeout
      const result = await Promise.race([executionPromise, timeoutPromise]);
      
      // Task completed successfully
      task.status = 'completed';
      task.completedAt = Date.now();
      task.result = result;
      
      this.taskStats.completed++;
      
      // Log to history
      await this.logHistoryEvent('task', 'completed', task, 'info', ['task', 'success']);
      
      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('task-completed', { task, result });
      }
      
      console.log(`Task completed: ${task.id}`);
      
    } catch (error) {
      // Task failed
      task.status = 'failed';
      task.completedAt = Date.now();
      task.error = error.message;
      
      this.taskStats.failed++;
      
      // Log to history
      await this.logHistoryEvent('task', 'failed', { ...task, error: error.message }, 'error', ['task', 'failure']);
      
      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('task-failed', { task, error });
      }
      
      console.error(`Task failed: ${task.id}`, error);
      
      // Auto-retry if configured
      if (task.retryCount < task.maxRetries) {
        console.log(`Scheduling retry for task: ${task.id}`);
        setTimeout(() => this.retryTask(task.id), 5000); // Retry after 5 seconds
      }
      
    } finally {
      this.runningTasks.delete(task.id);
      this.taskStats.running--;
      await this.saveTaskToStorage(task);
      
      // Check if this task is part of a chain
      if (task.chainId) {
        await this.processTaskChain(task.chainId);
      }
    }
  }

  async executeTaskAction(task) {
    // Route task to appropriate skill
    if (this.eventBus) {
      try {
        const response = await this.eventBus.sendSkillMessage(
          'background-tasks',
          task.skill,
          {
            type: 'execute-action',
            action: task.action,
            data: task.data
          }
        );
        return response;
      } catch (error) {
        throw new Error(`Task execution failed: ${error.message}`);
      }
    } else {
      throw new Error('Event bus not available');
    }
  }

  async processTaskChain(chainId) {
    const chain = this.taskChains.get(chainId);
    if (!chain) return;
    
    // Find next task in chain
    const currentTaskIndex = chain.currentTaskIndex;
    const nextTaskIndex = currentTaskIndex + 1;
    
    if (nextTaskIndex >= chain.taskIds.length) {
      // Chain completed
      chain.status = 'completed';
      chain.completedAt = Date.now();
      await this.saveTaskChainToStorage(chain);
      
      if (this.eventBus) {
        this.eventBus.emit('task-chain-completed', { chain });
      }
      
      console.log(`Task chain completed: ${chainId}`);
      return;
    }
    
    // Check if current task completed successfully
    const currentTaskId = chain.taskIds[currentTaskIndex];
    const currentTask = this.tasks.get(currentTaskId);
    
    if (currentTask.status === 'failed' && chain.onTaskFailure === 'stop') {
      // Chain failed
      chain.status = 'failed';
      chain.completedAt = Date.now();
      await this.saveTaskChainToStorage(chain);
      
      if (this.eventBus) {
        this.eventBus.emit('task-chain-failed', { chain, failedTask: currentTask });
      }
      
      console.log(`Task chain failed: ${chainId}`);
      return;
    }
    
    // Move to next task
    chain.currentTaskIndex = nextTaskIndex;
    await this.saveTaskChainToStorage(chain);
  }

  async cancelRunningTask(task) {
    // This would need to be implemented based on how tasks are executed
    // For now, we'll just mark it as cancelled
    console.log(`Cancelling running task: ${task.id}`);
  }

  async pauseRunningTasks() {
    // Pause all running tasks gracefully
    for (const taskId of this.runningTasks) {
      const task = this.tasks.get(taskId);
      if (task) {
        console.log(`Pausing task: ${taskId}`);
        // Implementation depends on task execution method
      }
    }
  }

  async resumePendingTasks() {
    // Resume all pending tasks
    const pendingTasks = Array.from(this.tasks.values())
      .filter(task => task.status === 'pending');
    
    for (const task of pendingTasks) {
      this.addToTaskQueue(task);
    }
    
    console.log(`Resumed ${pendingTasks.length} pending tasks`);
  }

  async cleanupOldTasks() {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    for (const [taskId, task] of this.tasks) {
      if (task.status === 'completed' && task.completedAt && task.completedAt < cutoffTime) {
        this.tasks.delete(taskId);
        await this.removeTaskFromStorage(taskId);
      }
    }
    
    console.log('Cleaned up old tasks');
  }

  async clearCompletedTasks() {
    for (const [taskId, task] of this.tasks) {
      if (task.status === 'completed') {
        this.tasks.delete(taskId);
        await this.removeTaskFromStorage(taskId);
      }
    }
    
    console.log('Cleared completed tasks');
  }

  getTaskStats() {
    return {
      ...this.taskStats,
      queueLength: this.taskQueue.length,
      runningCount: this.runningTasks.size,
      activeChains: this.taskChains.size
    };
  }

  async loadTasksFromStorage() {
    // Load tasks from storage
    if (this.storageManager) {
      try {
        const tasks = await this.storageManager.getData('background-tasks', { indexed: true });
        if (tasks) {
          for (const task of tasks) {
            this.tasks.set(task.id, task);
          }
        }
      } catch (error) {
        console.error('Error loading tasks from storage:', error);
      }
    }
  }

  async saveTaskToStorage(task) {
    if (this.storageManager) {
      try {
        await this.storageManager.storeData(`task-${task.id}`, task, { indexed: true });
      } catch (error) {
        console.error('Error saving task to storage:', error);
      }
    }
  }

  async removeTaskFromStorage(taskId) {
    if (this.storageManager) {
      try {
        await this.storageManager.removeData(`task-${taskId}`, { indexed: true });
      } catch (error) {
        console.error('Error removing task from storage:', error);
      }
    }
  }

  async saveTaskChainToStorage(chain) {
    if (this.storageManager) {
      try {
        await this.storageManager.storeData(`chain-${chain.id}`, chain, { indexed: true });
      } catch (error) {
        console.error('Error saving task chain to storage:', error);
      }
    }
  }

  getVersion() {
    return this.version;
  }

  getName() {
    return this.name;
  }

  isActive() {
    return this.isActive;
  }

  getDependencies() {
    return [];
  }

  getContextMenuItems() {
    return [
      {
        id: 'background-tasks_create',
        title: 'Create Background Task',
        contexts: ['page', 'selection']
      },
      {
        id: 'background-tasks_list',
        title: 'Show Task List',
        contexts: ['page']
      }
    ];
  }

  getContentScripts() {
    return [];
  }

  async handleContextMenu(info, tab) {
    switch (info.menuItemId) {
      case 'background-tasks_create':
        // Create task from context
        await this.createTaskFromContext(info, tab);
        break;
        
      case 'background-tasks_list':
        // Show task list
        await this.showTaskList(tab);
        break;
    }
  }

  async createTaskFromContext(info, tab) {
    const taskData = {
      skill: 'ui-assistant',
      action: 'handle-context-menu',
      data: {
        context: info,
        tab: tab
      }
    };
    
    await this.createTask(taskData);
  }

  async showTaskList(tab) {
    // Send message to content script to show task list
    chrome.tabs.sendMessage(tab.id, {
      action: 'show-task-list',
      skill: 'background-tasks'
    });
  }

  async getHealth() {
    const stats = this.getTaskStats();
    const healthScore = this.calculateHealthScore(stats);
    
    return {
      status: healthScore > 0.8 ? 'healthy' : healthScore > 0.5 ? 'warning' : 'error',
      score: healthScore,
      stats,
      timestamp: Date.now()
    };
  }

  calculateHealthScore(stats) {
    // Calculate health based on various metrics
    let score = 1.0;
    
    // Deduct for high failure rate
    if (stats.total > 0) {
      const failureRate = stats.failed / stats.total;
      score -= failureRate * 0.5;
    }
    
    // Deduct for too many running tasks
    if (stats.runningCount > this.config.maxConcurrentTasks * 0.8) {
      score -= 0.2;
    }
    
    // Deduct for large queue
    if (stats.queueLength > 50) {
      score -= 0.3;
    }
    
    return Math.max(0, score);
  }

  // Cron Scheduling Methods
  async scheduleCronTask(data) {
    const { cronExpression, taskData, name } = data;
    
    // Validate cron expression
    if (!this.cronParser.isValid(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }
    
    const scheduledTask = {
      id: crypto.randomUUID(),
      name: name || `Cron Task ${Date.now()}`,
      cronExpression,
      taskData,
      isActive: true,
      createdAt: Date.now(),
      lastExecuted: null,
      nextExecution: null,
      executionCount: 0
    };
    
    // Calculate next execution times
    const nextExecutions = this.cronParser.getNextExecutions(cronExpression, new Date(), 5);
    scheduledTask.nextExecution = nextExecutions.length > 0 ? nextExecutions[0].getTime() : null;
    
    // Store scheduled task
    this.scheduledTasks.set(scheduledTask.id, scheduledTask);
    await this.saveScheduledTaskToStorage(scheduledTask);
    
    // Set up Chrome alarm for next execution
    if (scheduledTask.nextExecution) {
      const delayMinutes = Math.max(1, Math.floor((scheduledTask.nextExecution - Date.now()) / 60000));
      try {
        await chrome.alarms.create(`cron-${scheduledTask.id}`, {
          delayInMinutes: delayMinutes
        });
      } catch (error) {
        console.error('Failed to create cron alarm:', error);
      }
    }
    
    console.log(`Cron task scheduled: ${scheduledTask.id} with expression: ${cronExpression}`);
    return scheduledTask;
  }

  async unscheduleCronTask(taskId) {
    const scheduledTask = this.scheduledTasks.get(taskId);
    if (!scheduledTask) {
      throw new Error(`Cron task not found: ${taskId}`);
    }
    
    // Cancel Chrome alarm
    try {
      const result = await chrome.alarms.clear(`cron-${taskId}`);
      if (!result) {
        console.warn(`No alarm found for task ${taskId}`);
      }
    } catch (error) {
      console.warn(`Failed to clear alarm for task ${taskId}:`, error);
    }
    
    // Remove from storage and memory
    scheduledTask.isActive = false;
    await this.saveScheduledTaskToStorage(scheduledTask);
    this.scheduledTasks.delete(taskId);
    
    console.log(`Cron task unscheduled: ${taskId}`);
    return { success: true, taskId };
  }

  async getCronTasks() {
    return Array.from(this.scheduledTasks.values()).map(task => ({
      ...task,
      description: this.cronParser.getDescription(task.cronExpression),
      nextExecutions: this.cronParser.getNextExecutions(task.cronExpression, new Date(), 3)
    }));
  }

  validateCronExpression(expression) {
    return {
      valid: this.cronParser.isValid(expression),
      description: this.cronParser.getDescription(expression),
      nextExecutions: this.cronParser.isValid(expression) ? 
        this.cronParser.getNextExecutions(expression, new Date(), 5) : []
    };
  }

  getCronPresets() {
    return this.cronParser.getPresets();
  }

  getNextCronExecutions(expression, fromDate = null, count = 5) {
    const from = fromDate ? new Date(fromDate) : new Date();
    return this.cronParser.getNextExecutions(expression, from, count);
  }

  async executeCronTask(taskId) {
    const scheduledTask = this.scheduledTasks.get(taskId);
    if (!scheduledTask || !scheduledTask.isActive) {
      return;
    }
    
    try {
      // Create and execute the task
      const task = await this.createTask({
        ...scheduledTask.taskData,
        cronTaskId: taskId,
        scheduledExecution: true
      });
      
      // Update scheduled task stats
      scheduledTask.lastExecuted = Date.now();
      scheduledTask.executionCount++;
      
      // Calculate next execution
      const nextExecutions = this.cronParser.getNextExecutions(
        scheduledTask.cronExpression, 
        new Date(), 
        5
      );
      
      if (nextExecutions.length > 0) {
        scheduledTask.nextExecution = nextExecutions[0].getTime();
        
        // Set up next alarm
        const delayMinutes = Math.max(1, Math.floor((scheduledTask.nextExecution - Date.now()) / 60000));
        try {
          await chrome.alarms.create(`cron-${taskId}`, {
            delayInMinutes: delayMinutes
          });
        } catch (error) {
          console.error('Failed to create next cron alarm:', error);
        }
      }
      
      await this.saveScheduledTaskToStorage(scheduledTask);
      console.log(`Cron task executed: ${taskId}, created task: ${task.id}`);
      
    } catch (error) {
      console.error(`Failed to execute cron task ${taskId}:`, error);
    }
  }

  async saveScheduledTaskToStorage(scheduledTask) {
    if (this.storageManager) {
      try {
        await this.storageManager.storeData(`cron-task-${scheduledTask.id}`, scheduledTask, { indexed: true });
      } catch (error) {
        console.error('Error saving scheduled task to storage:', error);
      }
    }
  }

  async loadScheduledTasksFromStorage() {
    if (this.storageManager) {
      try {
        const tasks = await this.storageManager.getData('cron-tasks', { indexed: true });
        if (tasks) {
          for (const task of tasks) {
            if (task.isActive) {
              this.scheduledTasks.set(task.id, task);
              
              // Reschedule if active
              if (task.nextExecution && task.nextExecution > Date.now()) {
                const delayMinutes = Math.max(1, Math.floor((task.nextExecution - Date.now()) / 60000));
                try {
                  await chrome.alarms.create(`cron-${task.id}`, {
                    delayInMinutes: delayMinutes
                  });
                } catch (error) {
                  console.error('Failed to reschedule cron alarm:', error);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading scheduled tasks from storage:', error);
      }
    }
  }

  // Enhanced setup for cron scheduling
  setupCronAlarmHandler() {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name && alarm.name.startsWith('cron-')) {
          const taskId = alarm.name.replace('cron-', '');
          this.executeCronTask(taskId);
        }
      });
    }
  }

  // History Management Methods
  async logHistoryEvent(type, action, data, severity = 'info', tags = []) {
    await this.historyManager.addEntry({
      type,
      skill: this.name,
      action,
      data,
      severity,
      tags,
      metadata: {
        taskId: data.taskId,
        chainId: data.chainId,
        cronTaskId: data.cronTaskId
      }
    });
  }

  async getHistory(query = {}) {
    // Default to background-tasks skill entries
    const searchQuery = { skill: this.name, ...query };
    return this.historyManager.search(searchQuery);
  }

  async getHistoryAnalytics(options = {}) {
    return this.historyManager.getAnalytics({
      skill: this.name,
      ...options
    });
  }

  exportHistory(options = {}) {
    const exportOptions = {
      filter: { skill: this.name },
      ...options
    };
    return this.historyManager.exportData(exportOptions);
  }

  async clearHistory(filter = {}) {
    const clearFilter = { skill: this.name, ...filter };
    return await this.historyManager.clearHistory(clearFilter);
  }

  async searchHistory(query = {}) {
    const searchQuery = { skill: this.name, ...query };
    return this.historyManager.search(searchQuery);
  }

  // Reminder Management Methods
  async createReminder(data) {
    const reminder = await this.reminderManager.createReminder(data);
    
    // Log to history
    await this.logHistoryEvent('reminder', 'created', reminder, 'info', ['reminder']);
    
    return reminder;
  }

  async updateReminder(reminderId, updates) {
    const reminder = await this.reminderManager.updateReminder(reminderId, updates);
    
    // Log to history
    await this.logHistoryEvent('reminder', 'updated', reminder, 'info', ['reminder']);
    
    return reminder;
  }

  async deleteReminder(reminderId) {
    const success = await this.reminderManager.deleteReminder(reminderId);
    
    if (success) {
      // Log to history
      await this.logHistoryEvent('reminder', 'deleted', { reminderId }, 'info', ['reminder']);
    }
    
    return { success };
  }

  getReminders(filter = {}) {
    return this.reminderManager.getReminders(filter);
  }

  getReminderStats() {
    return this.reminderManager.getStatistics();
  }

  async snoozeReminder(reminderId, minutes = null) {
    const result = await this.reminderManager.snoozeReminder(reminderId, minutes);
    
    // Log to history
    await this.logHistoryEvent('reminder', 'snoozed', result.reminder, 'info', ['reminder']);
    
    return result;
  }

  async dismissReminder(reminderId) {
    const result = await this.reminderManager.dismissReminder(reminderId);
    
    // Log to history
    await this.logHistoryEvent('reminder', 'dismissed', result.reminder, 'info', ['reminder']);
    
    return result;
  }

  getReminderCategories() {
    return this.reminderManager.getCategories();
  }
}

export { BackgroundTasksSkill };
