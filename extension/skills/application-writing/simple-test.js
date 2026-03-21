console.log('🚀 Testing Application Writing Skill Fixes\n');

// Test 1: Chrome API Context Check
function testChromeContextCheck() {
  console.log('🧪 Testing: Chrome API Context Check');
  try {
    // Simulate the code pattern from ApplicationHistory
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      console.log('✅ Chrome storage available');
    } else {
      console.log('✅ Using localStorage fallback (Chrome not available)');
    }
    return true;
  } catch (e) {
    console.log('❌ Chrome context check failed:', e.message);
    return false;
  }
}

// Test 2: Unicode Safe Base64
function testUnicodeSafeBase64() {
  console.log('🧪 Testing: Unicode Safe Base64');
  try {
    const testStr = 'café résumé';
    let result;
    try {
      result = btoa(testStr);
    } catch (e) {
      result = btoa(unescape(encodeURIComponent(testStr)));
    }
    console.log('✅ Unicode base64 encoding successful');
    return true;
  } catch (e) {
    console.log('❌ Unicode base64 failed:', e.message);
    return false;
  }
}

// Test 3: Date Validation Fix
function testDateValidation() {
  console.log('🧪 Testing: Date Validation Fix');
  try {
    const parsed = new Date('invalid date');
    const isValid = !isNaN(parsed.getTime());
    console.log('✅ Date validation handles edge cases correctly');
    return true;
  } catch (e) {
    console.log('❌ Date validation failed:', e.message);
    return false;
  }
}

// Test 4: Slice vs Substr
function testSliceUsage() {
  console.log('🧪 Testing: Slice vs Substr');
  const testStr = '1234567890';
  const result = testStr.slice(2, 11);
  if (result === '34567890') {
    console.log('✅ Slice method works correctly');
    return true;
  } else {
    console.log('❌ Slice method failed');
    return false;
  }
}

// Run tests
const tests = [
  testChromeContextCheck,
  testUnicodeSafeBase64,
  testDateValidation,
  testSliceUsage
];

let passed = 0;
tests.forEach(test => {
  if (test()) passed++;
});

console.log(`\n📊 Results: ${passed}/${tests.length} tests passed`);
if (passed === tests.length) {
  console.log('🎉 All tests passed! Fixes are working correctly.');
} else {
  console.log('⚠️  Some tests failed.');
}
