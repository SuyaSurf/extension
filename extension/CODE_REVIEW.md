# Code Review - Critical Issues & Fixes

## 🔴 Critical Issues Found

### 1. Missing Import Files
**Files Referenced but Not Created:**

#### Missing Utility Classes
```javascript
// These imports will fail - files don't exist:
import { TaskScheduler } from '../shared/utils/task-scheduler.js';
import { PerformanceMonitor } from '../shared/utils/performance-monitor.js';
```

**Fix Required - Create these files:**

#### File: `shared/utils/task-scheduler.js`
```javascript
/**
 * Task Scheduler for background operations
 */
class TaskScheduler {
  constructor() {
    this.alarms = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    this.isInitialized = true;
    console.log('Task Scheduler initialized');
  }

  async scheduleTask(taskId, delayInMinutes, data) {
    const alarmName = `task-${taskId}`;
    
    await chrome.alarms.create(alarmName, {
      delayInMinutes: delayInMinutes
    });
    
    this.alarms.set(alarmName, {
      taskId,
      data,
      scheduledAt: Date.now()
    });
    
    console.log(`Task scheduled: ${taskId} in ${delayInMinutes} minutes`);
  }

  async handleAlarm(alarm) {
    const taskInfo = this.alarms.get(alarm.name);
    if (taskInfo) {
      console.log(`Executing scheduled task: ${taskInfo.taskId}`);
      // Execute task logic here
      this.alarms.delete(alarm.name);
    }
  }

  async cancelTask(taskId) {
    const alarmName = `task-${taskId}`;
    await chrome.alarms.clear(alarmName);
    this.alarms.delete(alarmName);
  }

  async getScheduledTasks() {
    return Array.from(this.alarms.entries()).map(([name, info]) => ({
      alarmName: name,
      ...info
    }));
  }
}

export { TaskScheduler };
```

#### File: `shared/utils/performance-monitor.js`
```javascript
/**
 * Performance monitoring for extension operations
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.thresholds = {
      memoryUsage: 50 * 1024 * 1024, // 50MB
      responseTime: 2000, // 2 seconds
      cacheHitRate: 0.8 // 80%
    };
    this.isInitialized = false;
  }

  async initialize() {
    this.isInitialized = true;
    console.log('Performance Monitor initialized');
  }

  trackOperation(operation, duration) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    this.metrics.get(operation).push({
      duration,
      timestamp: Date.now()
    });

    // Check performance thresholds
    this.checkThresholds(operation, duration);
  }

  checkThresholds(operation, duration) {
    if (duration > this.thresholds.responseTime) {
      console.warn(`Slow operation detected: ${operation} took ${duration}ms`);
    }

    // Check memory usage
    if (performance.memory) {
      const memoryUsage = performance.memory.usedJSHeapSize;
      if (memoryUsage > this.thresholds.memoryUsage) {
        console.warn(`High memory usage: ${memoryUsage} bytes`);
        this.triggerCleanup();
      }
    }
  }

  triggerCleanup() {
    // Trigger garbage collection and cache cleanup
    if (global.gc) {
      global.gc();
    }
  }

  getPerformanceReport() {
    const report = {};
    
    for (const [operation, measurements] of this.metrics) {
      const durations = measurements.map(m => m.duration);
      report[operation] = {
        count: durations.length,
        average: durations.reduce((a, b) => a + b) / durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations),
        recent: durations.slice(-10)
      };
    }
    
    return report;
  }
}

export { PerformanceMonitor };
```

### 2. Missing Skill Files
**Skills Imported but Not Created:**

#### File: `skills/ui-assistant/skill.js`
```javascript
/**
 * UI Assistant Skill
 * Provides contextual help and interface assistance
 */
class UIAssistantSkill {
  constructor(config = {}) {
    this.name = 'ui-assistant';
    this.version = '1.0.0';
    this.isActive = false;
    this.config = {
      contextualHelp: true,
      voiceCommands: true,
      personalizedSuggestions: true,
      ...config
    };
  }

  async initialize() {
    console.log('Initializing UI Assistant Skill...');
  }

  async activate() {
    this.isActive = true;
    console.log('UI Assistant Skill activated');
  }

  async deactivate() {
    this.isActive = false;
    console.log('UI Assistant Skill deactivated');
  }

  async handleAction(action, data, sender = null) {
    switch (action) {
      case 'getStatus':
        return await this.getStatus();
      case 'quickAction':
        return await this.executeQuickAction(data.action);
      case 'showHelp':
        return await this.showHelp();
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async getStatus() {
    return {
      active: this.isActive,
      version: this.version,
      features: this.config
    };
  }

  async executeQuickAction(action) {
    console.log(`Executing quick action: ${action}`);
    return { success: true, action };
  }

  async showHelp() {
    return {
      message: 'UI Assistant - Contextual help and interface automation',
      commands: ['getStatus', 'quickAction', 'showHelp']
    };
  }

  getVersion() { return this.version; }
  getName() { return this.name; }
  isActive() { return this.isActive; }
  getDependencies() { return []; }
}

export { UIAssistantSkill };
```

### 3. TypeScript Configuration Issues
**File: `ui/tsconfig.json` - Missing Chrome Types**

**Fix Required:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["DOM", "DOM.Iterable", "ES6"],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/store/*": ["./src/store/*"],
      "@/types/*": ["./src/types/*"]
    },
    "types": ["chrome", "node"] // Add Chrome types
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
```

### 4. Package.json Dependencies
**Missing Dependencies in `ui/package.json`:**

**Fix Required - Add missing packages:**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-switch": "^1.0.3",
    "@radix-ui/react-progress": "^1.0.3",
    "@radix-ui/react-toast": "^1.1.5",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "lucide-react": "^0.294.0",
    "zustand": "^4.4.7"
  },
  "devDependencies": {
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@types/chrome": "^0.0.251",
    "typescript": "^5.2.2",
    "webpack": "^5.89.0",
    "webpack-cli": "^5.1.4",
    "ts-loader": "^9.5.1",
    "css-loader": "^6.8.1",
    "style-loader": "^3.3.3",
    "postcss": "^8.4.31",
    "postcss-loader": "^7.3.3",
    "tailwindcss": "^3.3.5",
    "autoprefixer": "^10.4.16",
    "html-webpack-plugin": "^5.5.3"
  }
}
```

## 🟡 Medium Priority Issues

### 5. Content Script Security
**File: `content-scripts/universal-handler.js`**

**Issue:** Potential XSS in `createAssistantPanel()` function

**Fix Required - Add sanitization:**
```javascript
function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function createAssistantPanel() {
  const panel = document.createElement('div');
  panel.id = 'aibot-panel';
  
  // Use safe HTML construction
  panel.innerHTML = `
    <div class="aibot-panel-header">
      <h3>${sanitizeHTML('AI Bot Assistant')}</h3>
      <button id="aibot-panel-close">&times;</button>
    </div>
    <div class="aibot-panel-content">
      <div class="aibot-panel-section">
        <h4>${sanitizeHTML('Page Context')}</h4>
        <p><strong>${sanitizeHTML('Type:')}</strong> ${sanitizeHTML(pageContext.type)}</p>
        <p><strong>${sanitizeHTML('URL:')}</strong> ${sanitizeHTML(pageContext.url)}</p>
      </div>
    </div>
  `;
  
  // Rest of function...
}
```

### 6. Event Bus Memory Leak
**File: `background/event-bus.js`**

**Issue:** Event history grows indefinitely

**Fix Required - Add cleanup:**
```javascript
constructor() {
  this.listeners = new Map();
  this.skillRegistry = null;
  this.eventHistory = [];
  this.maxHistorySize = 1000; // Already there
  this.eventStats = new Map();
  
  // Add cleanup interval
  setInterval(() => this.cleanupHistory(), 60000); // Every minute
}

cleanupHistory() {
  if (this.eventHistory.length > this.maxHistorySize) {
    this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
  }
  
  // Clean old stats (older than 1 hour)
  const oneHourAgo = Date.now() - 3600000;
  for (const [event, stats] of this.eventStats) {
    if (stats.lastEmitted < oneHourAgo) {
      this.eventStats.delete(event);
    }
  }
}
```

## 🟢 Low Priority Issues

### 7. Error Handling Consistency
**Multiple Files**

**Issue:** Inconsistent error handling patterns

**Fix Required - Standardize:**
```javascript
// Standard error handling pattern
async handleError(error, context, operation) {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    context,
    operation,
    timestamp: Date.now()
  };
  
  console.error(`Operation failed: ${operation}`, errorInfo);
  
  // Send to audit log if available
  if (this.auditLogger) {
    await this.auditLogger.log('operation_error', errorInfo);
  }
  
  // Return consistent error format
  return {
    success: false,
    error: error.message,
    code: error.code || 'UNKNOWN_ERROR',
    timestamp: Date.now()
  };
}
```

### 8. Performance Optimizations
**Various Files**

**Fix Required - Add lazy loading:**
```javascript
// In skill registry
async registerSkill(skillClass, config = {}) {
  try {
    // Lazy load skill class
    if (typeof skillClass === 'string') {
      skillClass = await import(`../skills/${skillClass}/skill.js`);
      skillClass = skillClass.default || skillClass[Object.keys(skillClass)[0]];
    }
    
    const skill = new skillClass({
      name: skillClass.name.replace('Skill', '').toLowerCase(),
      ...config
    });
    
    await skill.initialize();
    this.skills.set(skill.name, skill);
    
  } catch (error) {
    console.error(`Failed to register skill:`, error);
    throw error;
  }
}
```

## 📋 Immediate Action Plan

### Priority 1 (Fix Today)
1. Create missing utility files (`task-scheduler.js`, `performance-monitor.js`)
2. Create `ui-assistant/skill.js` stub
3. Install npm dependencies in `ui/` directory
4. Fix TypeScript configuration

### Priority 2 (Fix This Week)
1. Create remaining skill stub files
2. Fix content script security issues
3. Add memory leak prevention
4. Standardize error handling

### Priority 3 (Fix Next Week)
1. Add comprehensive testing
2. Performance optimization
3. Documentation updates
4. Security audit

## 🧪 Testing Checklist

### Before First Run
- [ ] All import paths resolve correctly
- [ ] No TypeScript errors
- [ ] npm dependencies installed
- [ ] Webpack builds successfully
- [ ] Manifest validates

### Basic Functionality Tests
- [ ] Service worker initializes
- [ ] Skills register correctly
- [ ] Event bus communication works
- [ ] Storage operations function
- [ ] Voice interface initializes

### Security Tests
- [ ] Encryption/decryption works
- [ ] Audit logging functions
- [ ] XSS prevention in content scripts
- [ ] Permission validation works

This comprehensive code review identifies all critical issues that need to be fixed before the extension can run properly. The missing files and dependency issues are the most urgent and should be addressed first.
