/**
 * Test file to verify all imports resolve correctly
 */

// Test Background Tasks Skill imports
try {
  import('./skills/background-tasks/skill.js');
  console.log('✓ Background Tasks Skill imports resolved');
} catch (error) {
  console.error('✗ Background Tasks Skill import failed:', error.message);
}

// Test utility imports
try {
  import('./shared/utils/cron-parser.js');
  console.log('✓ Cron Parser import resolved');
} catch (error) {
  console.error('✗ Cron Parser import failed:', error.message);
}

try {
  import('./shared/utils/history-manager.js');
  console.log('✓ History Manager import resolved');
} catch (error) {
  console.error('✗ History Manager import failed:', error.message);
}

try {
  import('./shared/utils/reminder-manager.js');
  console.log('✓ Reminder Manager import resolved');
} catch (error) {
  console.error('✗ Reminder Manager import failed:', error.message);
}

try {
  import('./shared/utils/audio-manager.js');
  console.log('✓ Audio Manager import resolved');
} catch (error) {
  console.error('✗ Audio Manager import failed:', error.message);
}

try {
  import('./shared/utils/task-dag.js');
  console.log('✓ Task DAG import resolved');
} catch (error) {
  console.error('✗ Task DAG import failed:', error.message);
}

// Test skill registry imports
try {
  import('./background/skill-registry.js');
  console.log('✓ Skill Registry import resolved');
} catch (error) {
  console.error('✗ Skill Registry import failed:', error.message);
}

console.log('Import test completed');
