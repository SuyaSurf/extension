/* ─── form-scanner.js ─── */
window.FormScanner = (() => {

  // Semantic dictionary for field types
  const FIELD_SEMANTICS = {
    firstName:   ['first name','first','given name','forename','fname','firstname','prenom','vorname','nombre'],
    lastName:    ['last name','last','surname','family name','lname','lastname','nachname','apellido'],
    fullName:    ['full name','name','your name','complete name','nombre completo'],
    email:       ['email','e-mail','email address','mail','correo','courriel'],
    phone:       ['phone','telephone','mobile','cell','contact number','tel','handphone','phone number'],
    address:     ['address','street','street address','addr','direccion','adresse'],
    address2:    ['address 2','apartment','apt','suite','unit','floor','line 2'],
    city:        ['city','town','locality','ciudad','ville','ort','stad'],
    state:       ['state','province','region','county','territory'],
    zip:         ['zip','postal code','postcode','zip code','plz','cp','cep'],
    country:     ['country','nation','pays','land','pais'],
    dob:         ['date of birth','dob','birthday','birth date','born','fecha nacimiento'],
    age:         ['age','how old','your age'],
    gender:      ['gender','sex','identity'],
    company:     ['company','organisation','organization','employer','business','firm','workplace'],
    jobTitle:    ['job title','title','position','role','occupation','designation'],
    website:     ['website','url','web','site','homepage','portfolio'],
    username:    ['username','user name','handle','login','screen name','nickname'],
    password:    ['password','pass','passwd','pwd','passphrase'],
    confirmPassword: ['confirm password','repeat password','retype password','verify password'],
    message:     ['message','comment','description','notes','remarks','feedback','enquiry','inquiry'],
    subject:     ['subject','topic','re','regarding'],
    cardNumber:  ['card number','credit card','debit card','pan','card no'],
    cardExpiry:  ['expiry','expiration','expires','exp date','mm/yy'],
    cardCvv:     ['cvv','cvc','security code','card code','csc'],
    cardHolder:  ['card holder','name on card','cardholder'],
  };

  // Input type classification
  const TYPE_MAP = {
    text: ['text','search','url','tel','email','number','password','hidden'],
    textarea: ['textarea'],
    select: ['select'],
    checkbox: ['checkbox'],
    radio: ['radio'],
    file: ['file'],
    date: ['date','datetime-local','time','month','week'],
    range: ['range'],
    color: ['color'],
    richText: ['contenteditable'],
    custom: ['combobox','listbox','textbox'],
  };

  // Detect what kind of input this is
  function classifyInput(el) {
    const tag = el.tagName.toLowerCase();
    const type = (el.type || '').toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const ce = el.getAttribute('contenteditable');

    if (ce === 'true') return 'richText';
    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'input') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'file') return 'file';
      if (['date','datetime-local','time','month','week'].includes(type)) return 'date';
      if (type === 'range') return 'range';
      if (type === 'color') return 'color';
      return 'text';
    }
    if (['combobox','listbox','textbox','spinbutton'].includes(role)) return 'custom';
    if (role === 'checkbox') return 'checkbox';
    if (role === 'radio') return 'radio';
    if (role === 'slider') return 'range';
    return 'text';
  }

  // Detect if this is a custom dropdown (Ant Design, Material UI, Select2, etc.)
  function isCustomDropdown(el) {
    const role = el.getAttribute('role');
    if (role === 'combobox' || role === 'listbox') return true;
    const cls = el.className || '';
    const patterns = ['select','dropdown','combobox','chosen','select2','ant-select',
      'mat-select','v-select','multiselect','selectize'];
    return patterns.some(p => cls.toLowerCase().includes(p));
  }

  // Detect if this is a typeahead/autocomplete input
  function isAutocomplete(el) {
    if (el.getAttribute('autocomplete') === 'off' && el.getAttribute('role') === 'combobox') return true;
    const cls = (el.className || '').toLowerCase();
    const patterns = ['autocomplete','typeahead','autosuggest','suggest','autocompl'];
    if (patterns.some(p => cls.includes(p))) return true;
    // Check for nearby aria-haspopup or aria-autocomplete
    if (el.getAttribute('aria-haspopup') || el.getAttribute('aria-autocomplete')) return true;
    return false;
  }

  // Detect if a rich text editor (Quill, TinyMCE, CKEditor, etc.)
  function isRichTextEditor(el) {
    const cls = (el.className || '').toLowerCase();
    const patterns = ['ql-editor','tox-edit-area','cke_editable','note-editable',
      'ProseMirror','codex-editor','fr-element','mce-content-body'];
    if (patterns.some(p => cls.includes(p) || el.id?.includes(p))) return true;
    const ce = el.getAttribute('contenteditable');
    if (ce === 'true') return true;
    return false;
  }

  // Get semantic field type from labels/attributes
  function getSemanticType(el) {
    const labels = window.DomUtils.getLabels(el);
    const combined = labels.join(' ').toLowerCase();
    const elType = (el.type || '').toLowerCase();

    // Email type is definitive
    if (elType === 'email') return 'email';
    if (elType === 'tel') return 'phone';
    if (elType === 'password') {
      // Check if it's a confirm field
      if (/confirm|repeat|retype|verify/.test(combined)) return 'confirmPassword';
      return 'password';
    }
    if (elType === 'file') return 'file';
    if (elType === 'date') return 'dob'; // may not always be dob, but most common

    // Check semantic dictionary
    for (const [type, keywords] of Object.entries(FIELD_SEMANTICS)) {
      if (keywords.some(k => combined.includes(k))) return type;
    }

    return null;
  }

  // Build a descriptor for a single field
  function describeField(el) {
    const labels = window.DomUtils.getLabels(el);
    const inputClass = classifyInput(el);
    const semanticType = getSemanticType(el);

    const desc = {
      el,
      tag: el.tagName.toLowerCase(),
      type: el.type || inputClass,
      inputClass,
      semanticType,
      labels,
      primaryLabel: labels[0] || el.name || el.id || '',
      name: el.name || '',
      id: el.id || '',
      placeholder: el.placeholder || '',
      required: el.required || el.getAttribute('aria-required') === 'true',
      disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
      readOnly: el.readOnly,
      isCustomDropdown: isCustomDropdown(el),
      isAutocomplete: isAutocomplete(el),
      isRichText: isRichTextEditor(el),
      visible: window.DomUtils.isVisible(el),
      value: el.value || el.innerText || '',
      options: el.tagName === 'SELECT' ? window.DomUtils.getSelectOptions(el) : [],
      maxLength: el.maxLength > 0 ? el.maxLength : null,
      min: el.min || null,
      max: el.max || null,
      pattern: el.pattern || null,
      accept: el.accept || null, // for file inputs
    };

    return desc;
  }

  // Detect wizard/multi-step form context with enhanced detection
  function detectWizardContext() {
    // Look for step indicators
    const stepIndicators = document.querySelectorAll(
      '[class*="step"], [class*="wizard"], [class*="progress-step"], ' +
      '[role="tab"], .tab, [data-step], [data-wizard-step], ' +
      '[class*="stage"], [class*="phase"], .step-indicator'
    );

    const progressBars = document.querySelectorAll(
      '[role="progressbar"], progress, [class*="progress"], ' +
      '[class*="progress-bar"], .progress-step'
    );

    const stepNumbers = document.querySelectorAll(
      '.step-number, [class*="step-indicator"], [class*="breadcrumb"], ' +
      '[class*="step-counter"], [data-step-number]'
    );

    // Look for wizard-specific containers
    const wizardContainers = document.querySelectorAll(
      '[class*="wizard"], [class*="multi-step"], [class*="stepper"], ' +
      '[class*="form-wizard"], [class*="step-form"], [data-wizard]'
    );

    // Look for navigation buttons typical in wizards
    const wizardNavButtons = document.querySelectorAll(
      '[class*="next"], [class*="previous"], [class*="back"], ' +
      '[class*="continue"], [class*="submit-step"], ' +
      'button[data-action="next"], button[data-action="previous"]'
    );

    const isWizard = stepIndicators.length > 1 || 
                     progressBars.length > 0 || 
                     wizardContainers.length > 0 ||
                     wizardNavButtons.length > 0;

    let currentStep = 0, totalSteps = 0;

    if (isWizard) {
      // Try to determine current step
      const active = document.querySelector(
        '[class*="step"][class*="active"], [class*="step"][aria-selected="true"], ' +
        '[class*="step"][class*="current"], .step.is-active, ' +
        '[class*="stage"][class*="active"], [class*="stage"][class*="current"]'
      );
      const allSteps = [...stepIndicators].filter(el =>
        window.DomUtils.isVisible(el)
      );
      totalSteps = allSteps.length;
      currentStep = active ? allSteps.indexOf(active) + 1 : 1;

      // Try reading step from progress bar value
      const pb = progressBars[0];
      if (pb) {
        const val = pb.value || pb.getAttribute('aria-valuenow');
        const max = pb.max || pb.getAttribute('aria-valuemax') || 100;
        if (val && max) currentStep = Math.round((val / max) * totalSteps) || currentStep;
      }

      // Try reading from data attributes
      const stepData = document.querySelector('[data-current-step]');
      if (stepData) {
        const stepValue = parseInt(stepData.getAttribute('data-current-step'));
        if (!isNaN(stepValue)) currentStep = stepValue;
      }
    }

    return { 
      isWizard, 
      currentStep, 
      totalSteps,
      hasStepIndicators: stepIndicators.length > 0,
      hasProgressBars: progressBars.length > 0,
      hasWizardContainers: wizardContainers.length > 0,
      hasNavigationButtons: wizardNavButtons.length > 0
    };
  }

  // Enhanced detection of conditional/hidden sections
  function detectConditionalSections() {
    const sections = [];
    
    // Look for various conditional patterns
    const conditionalSelectors = [
      '[data-condition]',
      '[data-show-if]',
      '[data-depends-on]',
      '[data-conditional]',
      '[data-visible-if]',
      '[class*="conditional"]',
      '[class*="dependent"]',
      '[class*="show-if"]',
      '[class*="hide-if"]',
      '[class*="reveal"]',
      '.conditional-section',
      '.dependent-field'
    ];

    for (const selector of conditionalSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const condition = el.dataset.condition || 
                           el.dataset.showIf || 
                           el.dataset.dependsOn || 
                           el.dataset.conditional ||
                           el.dataset.visibleIf;
          
          if (condition || el.className.includes('conditional')) {
            sections.push({
              el,
              condition: condition || 'class-based',
              visible: window.DomUtils.isVisible(el),
              type: 'conditional'
            });
          }
        }
      } catch (e) {
        console.warn('Invalid selector for conditional detection:', selector);
      }
    }

    // Look for dynamically hidden/shown elements
    const hiddenElements = document.querySelectorAll('[style*="display: none"], [style*="display:none"], [hidden]');
    for (const el of hiddenElements) {
      // Check if it contains form elements
      if (el.querySelector('input, textarea, select, button')) {
        sections.push({
          el,
          condition: 'style-hidden',
          visible: false,
          type: 'hidden-form'
        });
      }
    }

    return sections;
  }

  // Detect if form has dynamic content that might appear later
  function detectDynamicFormPotential() {
    // Look for triggers that might reveal form content
    const triggers = document.querySelectorAll([
      '[data-toggle]',
      '[data-target]',
      '[data-reveal]',
      '[data-expand]',
      '[class*="toggle"]',
      '[class*="trigger"]',
      '[class*="accordion"]',
      '[class*="collapsible"]',
      '.form-trigger',
      '.field-revealer'
    ].join(', '));

    // Look for tabs that might contain form content
    const tabs = document.querySelectorAll([
      '[role="tab"]',
      '[class*="tab"]',
      '.tab-button',
      '[data-tab]'
    ].join(', '));

    // Check if any tabs contain form elements
    const tabsWithForms = [...tabs].filter(tab => {
      const target = tab.getAttribute('aria-controls') || 
                     tab.getAttribute('data-target') || 
                     tab.getAttribute('href');
      if (target) {
        const targetEl = document.getElementById(target) || document.querySelector(target);
        return targetEl?.querySelector('input, textarea, select');
      }
      return false;
    });

    return {
      hasTriggers: triggers.length > 0,
      hasTabs: tabs.length > 0,
      hasTabsWithForms: tabsWithForms.length > 0,
      triggerCount: triggers.length,
      tabCount: tabs.length,
      formTabCount: tabsWithForms.length
    };
  }

  // Main scan function
  function scan() {
    const allInputEls = window.DomUtils.getAllInputs();
    const fields = [];
    const seen = new Set();

    for (const el of allInputEls) {
      // Deduplicate
      if (seen.has(el)) continue;
      seen.add(el);

      // Skip hidden / disabled
      if (el.type === 'hidden') continue;
      if (el.getAttribute('aria-hidden') === 'true') continue;

      const field = describeField(el);
      fields.push(field);
    }

    // Sort by DOM order (visual top-to-bottom)
    fields.sort((a, b) => {
      const posA = a.el.getBoundingClientRect().top;
      const posB = b.el.getBoundingClientRect().top;
      return posA - posB;
    });

    const wizard = detectWizardContext();
    const conditionals = detectConditionalSections();
    const dynamic = detectDynamicFormPotential();
    
    // Enhanced form detection for modern applications
    const modernForms = window.DomUtils.detectModernForms();
    const eventForms = window.DomUtils.detectEventForms();

    // Radio groups — group them
    const radioGroups = {};
    for (const f of fields) {
      if (f.inputClass === 'radio' && f.name) {
        if (!radioGroups[f.name]) radioGroups[f.name] = [];
        radioGroups[f.name].push(f);
      }
    }

    // Checkbox groups
    const checkboxGroups = {};
    for (const f of fields) {
      if (f.inputClass === 'checkbox' && f.name) {
        if (!checkboxGroups[f.name]) checkboxGroups[f.name] = [];
        checkboxGroups[f.name].push(f);
      }
    }

    return {
      fields,
      visibleFields: fields.filter(f => f.visible),
      radioGroups,
      checkboxGroups,
      wizard,
      conditionals,
      dynamic,
      modernForms,
      eventForms,
      timestamp: Date.now()
    };
  }

  // Form type detection based on field analysis and page context
  function detectFormType(scanResult = null) {
    const result = scanResult || window.FormScanner.scan();
    const fields = result.fields || [];
    if (fields.length === 0) {
      // Check if there's potential for dynamic forms
      if (result.dynamic?.hasTabsWithForms || result.dynamic?.hasTriggers) {
        return 'dynamic-potential'
      }
      return 'none';
    }

    // Count field types
    const fieldCounts = {
      personal: 0,      // name, email, phone, address
      login: 0,         // username, password
      search: 0,        // search, query, keyword
      message: 0,       // message, comment, feedback
      application: 0,   // job, company, experience
      payment: 0,       // card, billing, payment
      general: 0        // other inputs
    };

    // Analyze each field
    for (const field of fields) {
      if (!field.visible) continue;
      
      const semantic = field.semanticType;
      const labels = (field.labels || []).join(' ').toLowerCase();
      const placeholder = (field.placeholder || '').toLowerCase();
      const name = (field.name || '').toLowerCase();
      const combined = `${labels} ${placeholder} ${name}`;

      // Personal information fields
      if (['firstName', 'lastName', 'fullName', 'email', 'phone', 'address', 'address2', 'city', 'state', 'zip', 'country', 'dob', 'age', 'gender'].includes(semantic)) {
        fieldCounts.personal++;
      }
      // Login fields
      else if (['username', 'password', 'confirmPassword'].includes(semantic) || 
               /login|signin|sign.*in|log.*in/.test(combined)) {
        fieldCounts.login++;
      }
      // Search fields
      else if (/search|query|keyword|find|filter|locate/.test(combined)) {
        fieldCounts.search++;
      }
      // Message fields
      else if (['message'].includes(semantic) || 
               /message|comment|feedback|inquiry|enquiry|remark|note/.test(combined)) {
        fieldCounts.message++;
      }
      // Application fields
      else if (['company', 'jobTitle', 'website'].includes(semantic) || 
               /company|employer|occupation|position|experience|resume|cv/.test(combined)) {
        fieldCounts.application++;
      }
      // Payment fields
      else if (['cardNumber', 'cardExpiry', 'cardCvv', 'cardHolder'].includes(semantic) || 
               /card|payment|billing|cvv|expiry/.test(combined)) {
        fieldCounts.payment++;
      }
      else {
        fieldCounts.general++;
      }
    }

    // Check for sign-in forms
    if (fieldCounts.login >= 2 && fieldCounts.personal < 2) {
      return 'signin';
    }

    // Check for search forms (dominant search fields)
    if (fieldCounts.search >= 2 || (fieldCounts.search >= 1 && fieldCounts.search > fieldCounts.personal)) {
      return 'search';
    }

    // Check for contact forms
    if (fieldCounts.message >= 1 && fieldCounts.personal >= 1) {
      return 'contact';
    }

    // Check for application/registration forms
    if (fieldCounts.personal >= 3 || (fieldCounts.personal >= 2 && fieldCounts.application >= 1)) {
      return 'application';
    }

    // Check for payment forms
    if (fieldCounts.payment >= 2) {
      return 'payment';
    }

    // Check for wizard forms - give them priority
    if (result.wizard?.isWizard) {
      return 'wizard';
    }

    // Mixed form with some fillable fields
    if (fieldCounts.personal >= 1 || fieldCounts.message >= 1) {
      return 'mixed';
    }

    // If we have conditional sections, mark as dynamic
    if (result.conditionals?.length > 0) {
      return 'conditional';
    }

    return 'other';
  }

  // Detect if this is a sign-in page based on URL and content
  function isSignInPage() {
    const url = window.location.href.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();
    const title = document.title.toLowerCase();
    
    // URL patterns for sign-in pages
    const signInPatterns = [
      /login|signin|sign.*in|log.*in/,
      /auth|authenticate/,
      /account|session/,
      /oauth|sso/
    ];
    
    const urlMatch = signInPatterns.some(pattern => 
      pattern.test(url) || pattern.test(pathname)
    );
    
    // Content patterns
    const contentMatch = /sign.*in|log.*in|login|authenticate/.test(title);
    
    // Check for login forms
    const hasLoginForm = window.FormScanner.scan().fields.some(field => 
      field.visible && (
        field.semanticType === 'username' || 
        field.semanticType === 'password' ||
        /login|signin/.test((field.labels || []).join(' '))
      )
    );
    
    return urlMatch || contentMatch || hasLoginForm;
  }

  // Detect if this is a search-dominant page
  function isSearchPage() {
    const scanResult = window.FormScanner.scan();
    const searchFields = scanResult.fields.filter(field => 
      field.visible && /search|query|keyword|filter/.test(
        [(field.labels || []).join(' '), field.placeholder, field.name].join(' ').toLowerCase()
      )
    );
    
    // If most inputs are search-related, it's a search page
    const totalInputs = scanResult.visibleFields.length;
    return totalInputs > 0 && searchFields.length / totalInputs > 0.6;
  }

  // Get fillable field count (excludes search-only fields)
  function getFillableFieldCount(scanResult = null) {
    const fields = scanResult?.fields || window.FormScanner.scan().fields;
    return fields.filter(field => 
      field.visible && 
      !/search|query|keyword|filter/.test(
        [(field.labels || []).join(' '), field.placeholder, field.name].join(' ').toLowerCase()
      )
    ).length;
  }

  // Quick check if page has any forms worth filling
  function hasFormsOnPage() {
    const inputs = window.DomUtils.getAllInputs();
    return inputs.some(el =>
      el.type !== 'hidden' &&
      el.type !== 'submit' &&
      el.type !== 'button' &&
      el.type !== 'reset' &&
      window.DomUtils.isVisible(el)
    );
  }

  return { 
    scan, 
    describeField, 
    classifyInput, 
    getSemanticType, 
    detectWizardContext, 
    hasFormsOnPage, 
    FIELD_SEMANTICS,
    detectFormType,
    isSignInPage,
    isSearchPage,
    getFillableFieldCount,
    detectConditionalSections,
    detectDynamicFormPotential
  };
})();
