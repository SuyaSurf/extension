/* ─── field-matcher.js ─── */
(function(global) {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  
  if (!isBrowser) {
    // Export empty object for Node.js testing
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { matchAll: () => [], THRESHOLD: 0.35 };
    }
    return;
  }

  const FieldMatcher = (() => {

  // Weight config for scoring signals
  const WEIGHTS = {
    semanticTypeExact: 1.0,   // exact semantic type match
    labelFuzzy:        0.75,  // fuzzy match on label
    nameFuzzy:         0.55,  // fuzzy match on name attr
    idFuzzy:           0.45,  // fuzzy match on id attr
    placeholderFuzzy:  0.40,  // fuzzy match on placeholder
    inputTypeBonus:    0.2,   // correct input type
    visibilityBonus:   0.15,  // element is visible
  };

  const THRESHOLD = 0.35; // minimum score to consider a match

  // Profile field → semantic types mapping
  const PROFILE_SEMANTIC_MAP = {
    firstName:       ['firstName'],
    lastName:        ['lastName'],
    fullName:        ['fullName', 'firstName', 'lastName'],
    email:           ['email'],
    phone:           ['phone'],
    address:         ['address'],
    address2:        ['address2'],
    city:            ['city'],
    state:           ['state'],
    zip:             ['zip'],
    country:         ['country'],
    dob:             ['dob'],
    gender:          ['gender'],
    company:         ['company'],
    jobTitle:        ['jobTitle'],
    website:         ['website'],
    username:        ['username'],
    password:        ['password'],
    confirmPassword: ['confirmPassword'],
    message:         ['message'],
    subject:         ['subject'],
    cardNumber:      ['cardNumber'],
    cardExpiry:      ['cardExpiry'],
    cardCvv:         ['cardCvv'],
    cardHolder:      ['cardHolder'],
  };

  // Expected input types for profile fields
  const EXPECTED_INPUT_TYPES = {
    email:    ['email','text'],
    phone:    ['tel','text'],
    password: ['password'],
    confirmPassword: ['password'],
    dob:      ['date','text'],
    website:  ['url','text'],
    message:  ['textarea','richText'],
    cardNumber: ['text','number'],
    file:     ['file'],
    gender:   ['select','radio','custom'],
    country:  ['select','custom'],
    state:    ['select','custom','text'],
  };

  // Score a profile field against a form field descriptor
  function scoreMatch(profileKey, profileValue, fieldDesc) {
    let score = 0;
    const { semanticType, labels, name, id, placeholder, inputClass, type } = fieldDesc;
    const query = String(profileKey).toLowerCase();

    // 1. Semantic type exact match
    const profileSemantics = PROFILE_SEMANTIC_MAP[profileKey] || [profileKey];
    if (semanticType && profileSemantics.includes(semanticType)) {
      score += WEIGHTS.semanticTypeExact;
    }

    // 2. Label fuzzy match
    let bestLabelScore = 0;
    for (const label of labels) {
      const s = window.FuzzyMatch.score(query, label);
      if (s > bestLabelScore) bestLabelScore = s;
    }
    score += bestLabelScore * WEIGHTS.labelFuzzy;

    // 3. Name attribute fuzzy
    if (name) {
      score += window.FuzzyMatch.score(query, name.replace(/[_\-]/g,' ')) * WEIGHTS.nameFuzzy;
    }

    // 4. ID attribute fuzzy
    if (id) {
      score += window.FuzzyMatch.score(query, id.replace(/[_\-]/g,' ')) * WEIGHTS.idFuzzy;
    }

    // 5. Placeholder fuzzy
    if (placeholder) {
      score += window.FuzzyMatch.score(query, placeholder) * WEIGHTS.placeholderFuzzy;
    }

    // 6. Input type bonus
    const expectedTypes = EXPECTED_INPUT_TYPES[profileKey];
    if (expectedTypes && (expectedTypes.includes(type) || expectedTypes.includes(inputClass))) {
      score += WEIGHTS.inputTypeBonus;
    }

    // 7. Visibility bonus
    if (fieldDesc.visible) score += WEIGHTS.visibilityBonus;

    // Penalty: skip disabled/readonly
    if (fieldDesc.disabled || fieldDesc.readOnly) score *= 0.1;

    // Penalty: password fields should only match password keys
    if (inputClass === 'password' && !['password','confirmPassword'].includes(profileKey)) {
      score = 0;
    }
    if (['password','confirmPassword'].includes(profileKey) && inputClass !== 'text' && type !== 'password') {
      score *= 0.3;
    }

    return score;
  }

  // Match all profile fields to form fields (one-to-one assignment, greedy best-first)
  function matchAll(profile, scanResult) {
    const { fields } = scanResult;
    const matches = [];
    const usedFields = new Set();

    // Flatten profile to key-value pairs
    const profileEntries = flattenProfile(profile);

    // Score all combinations
    const scored = [];
    for (const [key, value] of profileEntries) {
      if (!value && value !== 0) continue; // skip empty profile fields
      for (const field of fields) {
        if (field.inputClass === 'radio' && field.name) continue; // handle radio groups separately
        const s = scoreMatch(key, value, field);
        if (s >= THRESHOLD) scored.push({ key, value, field, score: s });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Greedy assignment (highest score first)
    const usedKeys = new Set();
    for (const item of scored) {
      const fieldId = getFieldId(item.field);
      if (usedFields.has(fieldId)) continue;
      if (usedKeys.has(item.key)) continue; // each profile key assigned once
      usedFields.add(fieldId);
      usedKeys.add(item.key);
      matches.push(item);
    }

    // Handle radio groups
    const radioMatches = matchRadioGroups(profile, scanResult, usedKeys);
    matches.push(...radioMatches);

    // Handle checkbox groups
    const checkboxMatches = matchCheckboxGroups(profile, scanResult, usedKeys);
    matches.push(...checkboxMatches);

    return matches;
  }

  // Match radio button groups
  function matchRadioGroups(profile, scanResult, usedKeys) {
    const { radioGroups } = scanResult;
    const matches = [];
    const profileEntries = flattenProfile(profile);

    for (const [groupName, radioFields] of Object.entries(radioGroups)) {
      if (!radioFields.length) continue;
      const groupLabel = window.DomUtils.getLabels(
        radioFields[0].el.closest('fieldset, [role="radiogroup"], .form-group') || radioFields[0].el
      ).join(' ');

      let bestKey = null, bestScore = 0;
      for (const [key, value] of profileEntries) {
        if (usedKeys.has(key)) continue;
        const s = scoreMatch(key, value, { ...radioFields[0], labels: [groupLabel, groupName] });
        if (s > bestScore) { bestScore = s; bestKey = key; }
      }

      if (bestKey && bestScore >= THRESHOLD) {
        usedKeys.add(bestKey);
        matches.push({
          key: bestKey,
          value: profile[bestKey] || flattenProfile(profile).find(([k]) => k === bestKey)?.[1],
          field: { ...radioFields[0], _radioGroup: radioFields, inputClass: 'radio' },
          score: bestScore,
          isRadioGroup: true,
          radioFields
        });
      }
    }
    return matches;
  }

  // Match checkbox groups
  function matchCheckboxGroups(profile, scanResult, usedKeys) {
    const { checkboxGroups } = scanResult;
    const matches = [];
    const profileEntries = flattenProfile(profile);

    for (const [groupName, cbFields] of Object.entries(checkboxGroups)) {
      if (cbFields.length === 1) continue; // single checkboxes handled normally
      const groupLabel = groupName;
      let bestKey = null, bestScore = 0;
      for (const [key, value] of profileEntries) {
        if (usedKeys.has(key)) continue;
        const s = scoreMatch(key, value, { ...cbFields[0], labels: [groupLabel] });
        if (s > bestScore) { bestScore = s; bestKey = key; }
      }
      if (bestKey && bestScore >= THRESHOLD) {
        usedKeys.add(bestKey);
        matches.push({
          key: bestKey,
          value: profile[bestKey],
          field: cbFields[0],
          score: bestScore,
          isCheckboxGroup: true,
          checkboxFields: cbFields
        });
      }
    }
    return matches;
  }

  // Flatten nested profile object to [key, value] pairs
  function flattenProfile(profile, prefix = '') {
    const entries = [];
    for (const [k, v] of Object.entries(profile)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof File)) {
        entries.push(...flattenProfile(v, fullKey));
      } else {
        // Use last segment as the matching key
        const matchKey = k;
        entries.push([matchKey, v]);
      }
    }
    return entries;
  }

  // Stable ID for a field
  function getFieldId(field) {
    return `${field.id || field.name || ''}_${field.el?.getAttribute('data-testid') || ''}_${
      field.el?.getBoundingClientRect().top.toFixed(0) || ''}`;
  }

  // Find single best matching field for a specific query
  function findBestField(query, scanResult, inputClass = null) {
    const { fields } = scanResult;
    let best = null, bestScore = 0;
    for (const field of fields) {
      if (inputClass && field.inputClass !== inputClass) continue;
      const s = scoreMatch(query, null, field);
      if (s > bestScore) { bestScore = s; best = field; }
    }
    return bestScore >= THRESHOLD ? { field: best, score: bestScore } : null;
  }

  return { matchAll, scoreMatch, flattenProfile, findBestField, THRESHOLD };
})();

// Export for both environments
if (isBrowser) {
  window.FieldMatcher = FieldMatcher;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = FieldMatcher;
}

})(typeof window !== 'undefined' ? window : global);
