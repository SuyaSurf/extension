/* ─── form-scanner.js ─── */
(function(global) {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  
  if (!isBrowser) {
    // Export empty object for Node.js testing
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { scan: () => ({ fields: [], timestamp: Date.now() }) };
    }
    return;
  }

  const FormScanner = (() => {

  // ─── Semantic dictionary for field types ─────────────────────────────────
  // Extended with RSVP / event-registration / startup-accelerator fields
  const FIELD_SEMANTICS = {
    firstName:       ['first name','first','given name','forename','fname','firstname','prenom','vorname','nombre'],
    lastName:        ['last name','last','surname','family name','lname','lastname','nachname','apellido'],
    fullName:        ['full name','name','your name','complete name','nombre completo','attendee name','participant name'],
    email:           ['email','e-mail','email address','mail','correo','courriel','work email','business email'],
    phone:           ['phone','telephone','mobile','cell','contact number','tel','handphone','phone number'],
    address:         ['address','street','street address','addr','direccion','adresse'],
    address2:        ['address 2','apartment','apt','suite','unit','floor','line 2'],
    city:            ['city','town','locality','ciudad','ville','ort','stad'],
    state:           ['state','province','region','county','territory'],
    zip:             ['zip','postal code','postcode','zip code','plz','cp','cep'],
    country:         ['country','nation','pays','land','pais'],
    dob:             ['date of birth','dob','birthday','birth date','born','fecha nacimiento'],
    age:             ['age','how old','your age'],
    gender:          ['gender','sex','identity','pronouns'],
    company:         ['company','organisation','organization','employer','business','firm','workplace',
                      'startup','startup name','company name','organization name'],
    jobTitle:        ['job title','title','position','role','occupation','designation',
                      'current role','current position','your role','what is your role'],
    website:         ['website','url','web','site','homepage','portfolio','company website','startup website'],
    username:        ['username','user name','handle','login','screen name','nickname'],
    password:        ['password','pass','passwd','pwd','passphrase'],
    confirmPassword: ['confirm password','repeat password','retype password','verify password'],
    message:         ['message','comment','description','notes','remarks','feedback','enquiry','inquiry',
                      'additional information','anything else','other comments','tell us more'],
    subject:         ['subject','topic','re','regarding'],

    // ── RSVP / event-registration specific ───────────────────────────────
    attendanceType:  ['attendance','attending','will you attend','how will you attend',
                      'in person','virtual','online','hybrid','rsvp','i will attend'],
    dietaryRestrictions: ['dietary','diet','food','allergies','dietary restrictions',
                          'dietary requirements','food preference','food allergies',
                          'special dietary','vegetarian','vegan','halal','kosher','gluten'],
    tshirtSize:      ['t-shirt size','shirt size','tshirt','size','clothing size'],
    companySize:     ['company size','number of employees','team size','how many employees',
                      'employees','headcount','size of company','staff size'],
    companyStage:    ['stage','startup stage','company stage','funding stage','series',
                      'pre-seed','seed','series a','growth stage'],
    industry:        ['industry','sector','vertical','field','domain','market','niche'],
    hearAboutUs:     ['how did you hear','how did you find','referral','source','where did you hear',
                      'how did you learn','discovery source'],
    linkedIn:        ['linkedin','linkedin url','linkedin profile','linkedin.com'],
    twitter:         ['twitter','twitter handle','x handle','@'],
    instagram:       ['instagram','ig','@'],
    bio:             ['bio','biography','about you','about yourself','describe yourself',
                      'short bio','professional bio','introduction','brief description'],
    specialRequirements: ['special requirements','accessibility','accommodation','special needs',
                          'any special requirements','accessibility needs'],
    agenda:          ['agenda','session','track','which sessions','which workshops'],
    teamSize:        ['team size','how many team members','number of founders','co-founders'],
    fundingAmount:   ['funding','amount','how much funding','how much have you raised',
                      'total funding','capital raised'],
    productStage:    ['product stage','mvp','launched','beta','product ready','traction'],
    country2:        ['country of incorporation','country of registration','country of operation',
                      'where are you based','location','headquarters','hq'],
    referralCode:    ['referral code','promo code','voucher','coupon','invite code'],
    consent:         ['consent','agree','terms','privacy','i agree','accept terms',
                      'newsletter','marketing','opt in','subscribe'],

    // ── Payment fields ───────────────────────────────────────────────────
    cardNumber:      ['card number','credit card','debit card','pan','card no'],
    cardExpiry:      ['expiry','expiration','expires','exp date','mm/yy'],
    cardCvv:         ['cvv','cvc','security code','card code','csc'],
    cardHolder:      ['card holder','name on card','cardholder'],
  };

  // ─── Input type classification ───────────────────────────────────────────
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

  function isCustomDropdown(el) {
    const role = el.getAttribute('role');
    if (role === 'combobox' || role === 'listbox') return true;
    const cls = el.className || '';
    const patterns = ['select','dropdown','combobox','chosen','select2','ant-select',
      'mat-select','v-select','multiselect','selectize'];
    return patterns.some(p => cls.toLowerCase().includes(p));
  }

  function isAutocomplete(el) {
    if (el.getAttribute('autocomplete') === 'off' && el.getAttribute('role') === 'combobox') return true;
    const cls = (el.className || '').toLowerCase();
    const patterns = ['autocomplete','typeahead','autosuggest','suggest','autocompl'];
    if (patterns.some(p => cls.includes(p))) return true;
    if (el.getAttribute('aria-haspopup') || el.getAttribute('aria-autocomplete')) return true;
    return false;
  }

  function isRichTextEditor(el) {
    const cls = (el.className || '').toLowerCase();
    const patterns = ['ql-editor','tox-edit-area','cke_editable','note-editable',
      'ProseMirror','codex-editor','fr-element','mce-content-body'];
    if (patterns.some(p => cls.includes(p) || el.id?.includes(p))) return true;
    return el.getAttribute('contenteditable') === 'true';
  }

  function getSemanticType(el) {
    const labels = window.DomUtils.getLabels(el);
    const combined = labels.join(' ').toLowerCase();
    const elType = (el.type || '').toLowerCase();

    // Definitive type signals from input type attr
    if (elType === 'email') return 'email';
    if (elType === 'tel') return 'phone';
    if (elType === 'password') {
      if (/confirm|repeat|retype|verify/.test(combined)) return 'confirmPassword';
      return 'password';
    }
    if (elType === 'file') return 'file';
    if (elType === 'date') return 'dob';

    // Semantic dictionary scan — longest keyword wins to avoid partial mismatches
    let bestType = null, bestLen = 0;
    for (const [type, keywords] of Object.entries(FIELD_SEMANTICS)) {
      for (const k of keywords) {
        if (combined.includes(k) && k.length > bestLen) {
          bestLen = k.length;
          bestType = type;
        }
      }
    }
    return bestType;
  }

  function describeField(el) {
    const labels = window.DomUtils.getLabels(el);
    const inputClass = classifyInput(el);
    const semanticType = getSemanticType(el);

    return {
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
      accept: el.accept || null,
    };
  }

  // ─── Wizard detection ────────────────────────────────────────────────────
  function detectWizardContext() {
    const stepIndicators = document.querySelectorAll(
      '[class*="step"], [class*="wizard"], [class*="progress-step"], ' +
      '[role="tab"], .tab, [data-step], [data-wizard-step], ' +
      '[class*="stage"], [class*="phase"], .step-indicator'
    );
    const progressBars = document.querySelectorAll(
      '[role="progressbar"], progress, [class*="progress"], ' +
      '[class*="progress-bar"], .progress-step'
    );
    const wizardContainers = document.querySelectorAll(
      '[class*="wizard"], [class*="multi-step"], [class*="stepper"], ' +
      '[class*="form-wizard"], [class*="step-form"], [data-wizard]'
    );
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
      const active = document.querySelector(
        '[class*="step"][class*="active"], [class*="step"][aria-selected="true"], ' +
        '[class*="step"][class*="current"], .step.is-active, ' +
        '[class*="stage"][class*="active"], [class*="stage"][class*="current"]'
      );
      const allSteps = [...stepIndicators].filter(el => window.DomUtils.isVisible(el));
      totalSteps = allSteps.length;
      currentStep = active ? allSteps.indexOf(active) + 1 : 1;

      const pb = progressBars[0];
      if (pb) {
        const val = pb.value || pb.getAttribute('aria-valuenow');
        const max = pb.max || pb.getAttribute('aria-valuemax') || 100;
        if (val && max) currentStep = Math.round((val / max) * totalSteps) || currentStep;
      }

      const stepData = document.querySelector('[data-current-step]');
      if (stepData) {
        const sv = parseInt(stepData.getAttribute('data-current-step'));
        if (!isNaN(sv)) currentStep = sv;
      }
    }

    return { isWizard, currentStep, totalSteps,
             hasStepIndicators: stepIndicators.length > 0,
             hasProgressBars: progressBars.length > 0,
             hasWizardContainers: wizardContainers.length > 0,
             hasNavigationButtons: wizardNavButtons.length > 0 };
  }

  // ─── Conditional section detection ───────────────────────────────────────
  function detectConditionalSections() {
    const sections = [];
    const conditionalSelectors = [
      '[data-condition]','[data-show-if]','[data-depends-on]',
      '[data-conditional]','[data-visible-if]',
      '[class*="conditional"]','[class*="dependent"]',
      '[class*="show-if"]','[class*="hide-if"]','[class*="reveal"]',
      '.conditional-section','.dependent-field'
    ];

    for (const selector of conditionalSelectors) {
      try {
        for (const el of document.querySelectorAll(selector)) {
          const condition = el.dataset.condition || el.dataset.showIf ||
                           el.dataset.dependsOn || el.dataset.conditional ||
                           el.dataset.visibleIf;
          if (condition || el.className.includes('conditional')) {
            sections.push({ el, condition: condition || 'class-based',
                            visible: window.DomUtils.isVisible(el), type: 'conditional' });
          }
        }
      } catch (e) {}
    }

    for (const el of document.querySelectorAll('[style*="display: none"], [style*="display:none"], [hidden]')) {
      if (el.querySelector('input, textarea, select, button')) {
        sections.push({ el, condition: 'style-hidden', visible: false, type: 'hidden-form' });
      }
    }

    return sections;
  }

  // ─── Dynamic form potential detection ────────────────────────────────────
  function detectDynamicFormPotential() {
    const triggers = document.querySelectorAll([
      '[data-toggle]','[data-target]','[data-reveal]','[data-expand]',
      '[class*="toggle"]','[class*="trigger"]','[class*="accordion"]',
      '[class*="collapsible"]','.form-trigger','.field-revealer'
    ].join(', '));

    const tabs = document.querySelectorAll(
      '[role="tab"], [class*="tab"], .tab-button, [data-tab]'
    );

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

  // ─── Page form intent scoring ─────────────────────────────────────────────
  // Returns a 0–1 confidence that this page IS or WILL BE a form page,
  // even when no <input> elements are present yet (SPA not yet rendered).
  function getPageFormIntent() {
    const url    = (window.location.href   || '').toLowerCase();
    const path   = (window.location.pathname || '').toLowerCase();
    const title  = (document.title          || '').toLowerCase();
    const h1Text = [...document.querySelectorAll('h1,h2')].map(h => h.textContent).join(' ').toLowerCase();
    const bodySnippet = (document.body?.textContent || '').slice(0, 3000).toLowerCase();

    const signals = [];

    // ── URL / path signals (high confidence) ─────────────────────────────
    const urlFormPatterns = [
      { re: /\/forms?\//,            score: 0.5,  label: 'url:forms-path' },
      { re: /\/rsvp/,               score: 0.55, label: 'url:rsvp' },
      { re: /\/register/,           score: 0.45, label: 'url:register' },
      { re: /\/registration/,       score: 0.50, label: 'url:registration' },
      { re: /\/apply/,              score: 0.45, label: 'url:apply' },
      { re: /\/application/,        score: 0.45, label: 'url:application' },
      { re: /\/signup|\/sign-up/,   score: 0.40, label: 'url:signup' },
      { re: /\/contact/,            score: 0.35, label: 'url:contact' },
      { re: /\/enroll/,             score: 0.45, label: 'url:enroll' },
      { re: /\/submit/,             score: 0.40, label: 'url:submit' },
      { re: /withgoogle\.com/,      score: 0.25, label: 'domain:google-events' },
      { re: /typeform\.com/,        score: 0.65, label: 'domain:typeform' },
      { re: /forms\.gle|forms\.google/, score: 0.65, label: 'domain:google-forms' },
      { re: /jotform\.com/,         score: 0.65, label: 'domain:jotform' },
      { re: /airtable\.com/,        score: 0.45, label: 'domain:airtable' },
      { re: /eventbrite\.com/,      score: 0.40, label: 'domain:eventbrite' },
      { re: /lu\.ma|luma\.events/,  score: 0.40, label: 'domain:luma' },
    ];
    for (const p of urlFormPatterns) {
      if (p.re.test(url) || p.re.test(path)) {
        signals.push({ label: p.label, score: p.score });
      }
    }

    // ── Title / heading signals ──────────────────────────────────────────
    const textFormPatterns = [
      { re: /register|registration/,        score: 0.35, label: 'text:register' },
      { re: /rsvp/,                          score: 0.40, label: 'text:rsvp' },
      { re: /apply|application/,            score: 0.35, label: 'text:apply' },
      { re: /sign up|signup/,               score: 0.30, label: 'text:signup' },
      { re: /enroll|enrolment/,             score: 0.35, label: 'text:enroll' },
      { re: /contact us|get in touch/,      score: 0.25, label: 'text:contact' },
      { re: /submit|submission/,            score: 0.25, label: 'text:submit' },
      { re: /fill (in|out)|complete (the |this )?(form|registration)/, score: 0.35, label: 'text:fill-form' },
      { re: /your (name|email|details)/,    score: 0.30, label: 'text:your-info' },
      { re: /required fields|required \*/,  score: 0.45, label: 'text:required-fields' },
      { re: /accelerator|program|cohort/,   score: 0.15, label: 'text:accelerator' },
    ];
    const textToSearch = title + ' ' + h1Text + ' ' + bodySnippet;
    for (const p of textFormPatterns) {
      if (p.re.test(textToSearch)) {
        signals.push({ label: p.label, score: p.score });
      }
    }

    // ── DOM structural signals ────────────────────────────────────────────
    const hasSubmitButton = !!document.querySelector(
      'button[type="submit"], input[type="submit"], ' +
      'button:not([type]), [role="button"][class*="submit"]'
    );
    if (hasSubmitButton) signals.push({ label: 'dom:submit-button', score: 0.30 });

    const hasFormEl = !!document.querySelector('form');
    if (hasFormEl) signals.push({ label: 'dom:form-element', score: 0.25 });

    const hasLabelEls = document.querySelectorAll('label').length > 2;
    if (hasLabelEls) signals.push({ label: 'dom:labels', score: 0.20 });

    // Angular / React app roots (SPA — form probably pending render)
    const isSPA = !!(document.querySelector('[ng-version], [data-reactroot], #__next, #app, #root'));
    if (isSPA && signals.length > 0) signals.push({ label: 'dom:spa-root', score: 0.10 });

    // ── Cap and combine ────────────────────────────────────────────────────
    // Use diminishing returns: each signal adds less as confidence grows
    let score = 0;
    for (const s of signals) {
      score = score + s.score * (1 - score); // diminishing returns
    }
    score = Math.min(score, 1);

    return {
      score,
      isLikelyFormPage: score >= 0.40,
      signals,
      isSPA
    };
  }

  // ─── Main scan function ───────────────────────────────────────────────────
  function scan() {
    const allInputEls = window.DomUtils.getAllInputs();
    const fields = [];
    const seen = new WeakSet(); // Use WeakSet for DOM elements

    for (const el of allInputEls) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.type === 'hidden') continue;
      if (el.getAttribute('aria-hidden') === 'true') continue;

      fields.push(describeField(el));
    }

    // Sort by DOM order
    fields.sort((a, b) => {
      const posA = a.el.getBoundingClientRect().top;
      const posB = b.el.getBoundingClientRect().top;
      return posA - posB;
    });

    const wizard      = detectWizardContext();
    const conditionals = detectConditionalSections();
    const dynamic     = detectDynamicFormPotential();
    const modernForms = window.DomUtils.detectModernForms();
    const eventForms  = window.DomUtils.detectEventForms();

    // Radio groups
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

  // ─── Scan + context: always returns something useful ─────────────────────
  // Even when no inputs exist yet, returns intent + structural hints.
  function scanWithContext() {
    const result = scan();
    const intent = getPageFormIntent();
    return {
      ...result,
      intent,
      isEmpty: result.fields.length === 0,
      message: result.fields.length > 0
        ? `Found ${result.fields.length} field(s)`
        : intent.isLikelyFormPage
          ? 'No fields yet — form is likely pending render (SPA)'
          : 'No form detected on this page'
    };
  }

  // ─── MutationObserver — watch for form inputs appearing ──────────────────
  // callback(scanResult) is called once when inputs appear (or timeout hits).
  // Returns a stop() function.
  function watchForForms(callback, options = {}) {
    const {
      timeout       = 15000,   // stop watching after 15s
      debounceMs    = 300,     // debounce rapid DOM changes
      minFields     = 1,       // minimum inputs before firing
      invokeNow     = false,   // fire immediately if fields already present
    } = options;

    let timer = null;
    let debounce = null;
    let stopped = false;
    let fired = false;
    let observer = null;

    function tryFire() {
      if (stopped || fired) return;
      try {
        const result = scan();
        const visibleFillable = result.visibleFields.filter(
          f => !['submit','button','reset','hidden'].includes(f.type)
        );
        if (visibleFillable.length >= minFields) {
          fired = true;
          stop();
          callback(result);
        }
      } catch (error) {
        console.error('[FormScanner] Error during tryFire:', error);
        // Don't stop on error, continue watching
      }
    }

    function onMutation() {
      if (stopped) return;
      clearTimeout(debounce);
      debounce = setTimeout(tryFire, debounceMs);
    }

    try {
      observer = new MutationObserver(onMutation);
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'hidden', 'aria-hidden', 'class']
      });
    } catch (error) {
      console.error('[FormScanner] Failed to create MutationObserver:', error);
      // Fallback to periodic checking
      const interval = setInterval(tryFire, 1000);
      timer = setTimeout(() => {
        clearInterval(interval);
        if (!fired) callback(scan());
      }, timeout);
      return { stop: () => { clearInterval(interval); clearTimeout(timer); } };
    }

    // Timeout hard stop
    timer = setTimeout(() => {
      if (!fired) {
        stop();
        // Still call back with whatever we have (might be 0 fields)
        try {
          callback(scan());
        } catch (error) {
          console.error('[FormScanner] Error in timeout callback:', error);
        }
      }
    }, timeout);

    function stop() {
      if (stopped) return;
      stopped = true;
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      clearTimeout(timer);
      clearTimeout(debounce);
    }

    // Check immediately
    if (invokeNow) tryFire();

    return { stop };
  }

  // ─── Form type detection ──────────────────────────────────────────────────
  function detectFormType(scanResult = null) {
    const result = scanResult || scan();
    const fields = result.fields || [];
    if (fields.length === 0) {
      if (result.dynamic?.hasTabsWithForms || result.dynamic?.hasTriggers) return 'dynamic-potential';
      return 'none';
    }

    const fieldCounts = { personal:0, login:0, search:0, message:0, application:0, payment:0, event:0, general:0 };
    const eventSemantics = ['attendanceType','dietaryRestrictions','tshirtSize','companySize',
                             'companyStage','industry','hearAboutUs','agenda','teamSize',
                             'fundingAmount','productStage','specialRequirements'];

    for (const field of fields) {
      if (!field.visible) continue;
      const semantic = field.semanticType;
      const combined = [(field.labels || []).join(' '), field.placeholder, field.name].join(' ').toLowerCase();

      if (['firstName','lastName','fullName','email','phone','address','address2',
           'city','state','zip','country','dob','age','gender'].includes(semantic)) {
        fieldCounts.personal++;
      } else if (['username','password','confirmPassword'].includes(semantic) ||
                 /login|signin|sign.*in|log.*in/.test(combined)) {
        fieldCounts.login++;
      } else if (/search|query|keyword|find|filter|locate/.test(combined)) {
        fieldCounts.search++;
      } else if (['message','bio'].includes(semantic) ||
                 /message|comment|feedback|inquiry|enquiry|remark|note/.test(combined)) {
        fieldCounts.message++;
      } else if (['company','jobTitle','website','linkedIn','twitter','instagram'].includes(semantic) ||
                 /company|employer|occupation|position|experience|resume|cv/.test(combined)) {
        fieldCounts.application++;
      } else if (['cardNumber','cardExpiry','cardCvv','cardHolder'].includes(semantic) ||
                 /card|payment|billing|cvv|expiry/.test(combined)) {
        fieldCounts.payment++;
      } else if (eventSemantics.includes(semantic)) {
        fieldCounts.event++;
      } else {
        fieldCounts.general++;
      }
    }

    if (fieldCounts.login >= 2 && fieldCounts.personal < 2) return 'signin';
    if (fieldCounts.search >= 2 || (fieldCounts.search >= 1 && fieldCounts.search > fieldCounts.personal)) return 'search';
    if (fieldCounts.event >= 2) return 'event_registration';
    if (fieldCounts.message >= 1 && fieldCounts.personal >= 1) return 'contact';
    if (fieldCounts.personal >= 3 || (fieldCounts.personal >= 2 && fieldCounts.application >= 1)) return 'application';
    if (fieldCounts.payment >= 2) return 'payment';
    if (result.wizard?.isWizard) return 'wizard';
    if (fieldCounts.personal >= 1 || fieldCounts.message >= 1 || fieldCounts.event >= 1) return 'mixed';
    if (result.conditionals?.length > 0) return 'conditional';
    return 'other';
  }

  function isSignInPage() {
    const url      = window.location.href.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();
    const title    = document.title.toLowerCase();
    const signInPatterns = [/login|signin|sign.*in|log.*in/,/auth|authenticate/,/account|session/,/oauth|sso/];
    const urlMatch     = signInPatterns.some(p => p.test(url) || p.test(pathname));
    const contentMatch = /sign.*in|log.*in|login|authenticate/.test(title);
    const hasLoginForm = scan().fields.some(field =>
      field.visible && (
        field.semanticType === 'username' ||
        field.semanticType === 'password' ||
        /login|signin/.test((field.labels || []).join(' '))
      )
    );
    return urlMatch || contentMatch || hasLoginForm;
  }

  function isSearchPage() {
    const scanResult = scan();
    const searchFields = scanResult.fields.filter(field =>
      field.visible && /search|query|keyword|filter/.test(
        [(field.labels || []).join(' '), field.placeholder, field.name].join(' ').toLowerCase()
      )
    );
    const total = scanResult.visibleFields.length;
    return total > 0 && searchFields.length / total > 0.6;
  }

  function getFillableFieldCount(scanResult = null) {
    const fields = scanResult?.fields || scan().fields;
    return fields.filter(field =>
      field.visible &&
      !/search|query|keyword|filter/.test(
        [(field.labels || []).join(' '), field.placeholder, field.name].join(' ').toLowerCase()
      )
    ).length;
  }

  function hasFormsOnPage() {
    // Check both real inputs AND page intent for SPAs
    const inputs = window.DomUtils.getAllInputs();
    const hasInputs = inputs.some(el =>
      el.type !== 'hidden' && el.type !== 'submit' &&
      el.type !== 'button' && el.type !== 'reset' &&
      window.DomUtils.isVisible(el)
    );
    if (hasInputs) return true;
    // Fallback: high intent means form will probably render
    return getPageFormIntent().isLikelyFormPage;
  }

  return {
    scan,
    scanWithContext,
    watchForForms,
    getPageFormIntent,
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
    detectDynamicFormPotential,
  };
})();

// Export for both environments
if (isBrowser) {
  window.FormScanner = FormScanner;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormScanner;
}

})(typeof window !== 'undefined' ? window : global);
