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

  // Detect wizard/multi-step form context
  function detectWizardContext() {
    // Look for step indicators
    const stepIndicators = document.querySelectorAll(
      '[class*="step"], [class*="wizard"], [class*="progress-step"], ' +
      '[role="tab"], .tab, [data-step], [data-wizard-step]'
    );

    const progressBars = document.querySelectorAll(
      '[role="progressbar"], progress, [class*="progress"]'
    );

    const stepNumbers = document.querySelectorAll(
      '.step-number, [class*="step-indicator"], [class*="breadcrumb"]'
    );

    const isWizard = stepIndicators.length > 1 || progressBars.length > 0;

    let currentStep = 0, totalSteps = 0;

    if (isWizard) {
      // Try to determine current step
      const active = document.querySelector(
        '[class*="step"][class*="active"], [class*="step"][aria-selected="true"], ' +
        '[class*="step"][class*="current"], .step.is-active'
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
    }

    return { isWizard, currentStep, totalSteps };
  }

  // Detect conditional/hidden sections that may reveal more fields
  function detectConditionalSections() {
    const sections = [];
    const candidates = document.querySelectorAll(
      '[data-condition], [data-show-if], [data-depends-on], ' +
      '[class*="conditional"], [class*="dependent"], [class*="show-if"]'
    );
    for (const el of candidates) {
      sections.push({
        el,
        condition: el.dataset.condition || el.dataset.showIf || el.dataset.dependsOn,
        visible: window.DomUtils.isVisible(el)
      });
    }
    return sections;
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
      timestamp: Date.now()
    };
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

  return { scan, describeField, classifyInput, getSemanticType, detectWizardContext, hasFormsOnPage, FIELD_SEMANTICS };
})();
