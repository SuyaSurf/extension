/* ─── ai-processor.js ─── */

/**
 * AIContentProcessor — improvements over v1:
 *  - `callServerAPI` has timeout + retry (2 attempts, 8s each)
 *  - If server is unavailable, falls back gracefully to client-side generation
 *    without swallowing errors silently
 *  - `generateEventRegistrationContent()` added for RSVP / accelerator forms
 *  - Cache key is more discriminating (includes URL fingerprint)
 *  - Profile sanitisation preserves all non-sensitive fields (previous version
 *    was too aggressive with deletes)
 */
class AIContentProcessor {
  constructor() {
    this.serverEndpoint = 'http://localhost:3000';
    this.cache = new Map();
    this.maxCacheSize = 50;
    this._serverAvailable = null; // tri-state: null=unknown, true, false
    this._lastServerCheck = 0;
    this._SERVER_CHECK_TTL = 30_000; // re-check server every 30s
    this._REQUEST_TIMEOUT  = 8_000;  // 8s per request attempt
  }

  async initialize(config = {}) {
    this.serverEndpoint = config.serverEndpoint || this.serverEndpoint;
    console.log('[AIContentProcessor] Initialized, endpoint:', this.serverEndpoint);
  }

  async generateContent(request) {
    const cacheKey = this._generateCacheKey(request);
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    const payload = {
      applicationType:   request.applicationType || this._inferApplicationType(request),
      formRequirements:  this._extractFormRequirements(request.formRequirements),
      userProfile:       this._sanitizeProfile(request.userProfile),
      // Historical values from ApplicationHistory — highest authority for text fields
      historicalContext: request.historicalContext || {},
      context: {
        url:       typeof window !== 'undefined' ? window.location?.href   || '' : '',
        title:     typeof document !== 'undefined' ? document.title         || '' : '',
        pageType:  this._detectPageType(),
        timestamp: Date.now(),
        ...(request.context || {}),
      },
    };

    let response;
    try {
      response = await this._callWithFallback(payload);
    } catch (error) {
      console.error('[AIContentProcessor] Content generation failed:', error);
      response = this._generateFallbackContent(request);
    }

    this._addToCache(cacheKey, response);
    return response;
  }

  // ─── Server call with timeout, retry, and graceful fallback ───────────────
  async _callWithFallback(payload) {
    // If server was recently confirmed unavailable, skip straight to client-side
    const now = Date.now();
    const serverSkip = this._serverAvailable === false &&
                       (now - this._lastServerCheck) < this._SERVER_CHECK_TTL;

    if (!serverSkip) {
      try {
        const result = await this._callServerWithTimeout(payload);
        this._serverAvailable = true;
        this._lastServerCheck  = now;
        return result;
      } catch (err) {
        console.warn('[AIContentProcessor] Server unavailable, using client-side generation:', err.message);
        this._serverAvailable = false;
        this._lastServerCheck  = now;
      }
    }

    // Client-side generation
    return this._generateClientSideContent(payload);
  }

  async _callServerWithTimeout(payload, attempt = 0) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), this._REQUEST_TIMEOUT);

    try {
      const response = await fetch(`${this.serverEndpoint}/api/ai/generate-application`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  controller.signal,
      });
      clearTimeout(tid);

      if (!response.ok) throw new Error(`Server responded ${response.status}`);
      return await response.json();
    } catch (err) {
      clearTimeout(tid);
      // One retry on network errors (not 4xx)
      if (attempt === 0 && err.name !== 'AbortError' && !/^4/.test(String(err.message))) {
        await new Promise(r => setTimeout(r, 500));
        return this._callServerWithTimeout(payload, 1);
      }
      throw err;
    }
  }

  // ─── Client-side content generation ───────────────────────────────────────
  _generateClientSideContent(payload) {
    const { applicationType, formRequirements, userProfile, historicalContext } = payload;

    let result;
    switch (applicationType) {
      case 'job_application':    result = this._generateJobApplicationContent(formRequirements, userProfile); break;
      case 'grant_application':  result = this._generateGrantApplicationContent(formRequirements, userProfile); break;
      case 'event_registration': result = this._generateEventRegistrationContent(formRequirements, userProfile); break;
      case 'general_form':       result = this._generateGeneralFormContent(formRequirements, userProfile); break;
      default:                   result = this._generateBasicContent(formRequirements, userProfile);
    }

    // Overlay historical values: user corrections always beat fresh AI output
    if (historicalContext && Object.keys(historicalContext).length) {
      result.content = result.content || {};
      for (const [semanticType, hist] of Object.entries(historicalContext)) {
        if (hist.corrected || hist.source === 'pinned' || hist.source === 'user') {
          result.content[semanticType] = hist.value;
        } else if (!result.content[semanticType] && hist.value) {
          // Fill gaps with non-corrected historical values too
          result.content[semanticType] = hist.value;
        }
      }
      result.historicalFieldsApplied = Object.keys(historicalContext).length;
    }

    return result;
  }

  _generateJobApplicationContent(formRequirements, profile) {
    const content = {};
    if (this._hasFieldType(formRequirements, 'message')) {
      content.message = this._generateCoverLetter(profile);
    }
    if (this._hasFieldMatching(formRequirements, /why/)) {
      content.whyWorkHere = this._generateWhyWorkHere(profile);
    }
    if (this._hasFieldMatching(formRequirements, /salary/)) {
      content.salary = this._generateSalaryExpectations(profile);
    }
    return { content, confidence: 0.80,
             suggestions: ['Review generated content before submission', 'Customise for company culture'] };
  }

  _generateGrantApplicationContent(formRequirements, profile) {
    const content = {};
    if (this._hasFieldType(formRequirements, 'message')) {
      content.projectDescription = this._generateProjectDescription(profile);
    }
    if (this._hasFieldMatching(formRequirements, /budget/)) {
      content.budgetJustification = this._generateBudgetJustification(profile);
    }
    if (this._hasFieldMatching(formRequirements, /impact|outcome|result/)) {
      content.impactStatement = this._generateImpactStatement(profile);
    }
    if (this._hasFieldMatching(formRequirements, /timeline|milestone/)) {
      content.timeline = this._generateTimeline(profile);
    }
    if (this._hasFieldMatching(formRequirements, /team|personnel|staff/)) {
      content.teamDescription = this._generateTeamDescription(profile);
    }
    if (this._hasFieldMatching(formRequirements, /innovation|novelty|unique/)) {
      content.innovationStatement = this._generateInnovationStatement(profile);
    }
    return { content, confidence: 0.80,
             suggestions: ['Include specific metrics and outcomes', 'Align with grant requirements', 'Add quantifiable impact measures'] };
  }

  // RSVP / accelerator event registration
  _generateEventRegistrationContent(formRequirements, profile) {
    const content = {};
    const p = profile || {};

    if (this._hasFieldType(formRequirements, 'message') || this._hasFieldType(formRequirements, 'bio')) {
      content.message = this._generateEventBio(p);
      content.bio     = content.message;
    }
    if (this._hasFieldMatching(formRequirements, /why|hope|gain|expect|learn/)) {
      content.whyAttend = this._generateWhyAttend(p);
    }
    if (this._hasFieldMatching(formRequirements, /stage|funding|series/)) {
      content.companyStage = p.companyStage || p.stage || 'Seed';
    }
    if (this._hasFieldMatching(formRequirements, /industry|sector|vertical/)) {
      content.industry = p.industry || 'Technology';
    }
    if (this._hasFieldMatching(formRequirements, /linkedin/)) {
      content.linkedIn = p.linkedIn || p.website || '';
    }
    if (this._hasFieldMatching(formRequirements, /pitch|elevator|summary/)) {
      content.pitch = this._generateElevatorPitch(p);
    }
    if (this._hasFieldMatching(formRequirements, /challenge|problem|pain/)) {
      content.problemStatement = this._generateProblemStatement(p);
    }
    if (this._hasFieldMatching(formRequirements, /solution|value|proposition/)) {
      content.solution = this._generateSolutionStatement(p);
    }
    if (this._hasFieldMatching(formRequirements, /traction|progress|momentum/)) {
      content.traction = this._generateTractionStatement(p);
    }

    return {
      content,
      confidence: 0.88,
      suggestions: ['Verify company stage and funding details', 'Tailor "why attend" to the specific program', 'Include specific metrics and achievements'],
    };
  }

  _generateGeneralFormContent(formRequirements, profile) {
    const content = {};
    (formRequirements.fields || []).forEach(field => {
      if (field.semanticType && profile[field.semanticType] !== undefined) {
        content[field.semanticType] = profile[field.semanticType];
      }
    });
    return { content, confidence: 0.90, suggestions: [] };
  }

  _generateBasicContent(formRequirements, profile) {
    return { content: profile || {}, confidence: 0.70, suggestions: ['Verify all field mappings'] };
  }

  // ─── Content generators ────────────────────────────────────────────────────
  _generateCoverLetter(p) {
    const { firstName = '', lastName = '', jobTitle = 'professional', company = 'your company', experience = 'the field' } = p;
    return `Dear Hiring Manager,

I am writing to express my strong interest in this position at ${company}. With my background as ${jobTitle} and experience in ${experience}, I believe I would be a valuable addition to your team.

My skills align well with the requirements of this role, and I am particularly drawn to this opportunity for the meaningful projects and growth it offers.

Thank you for your consideration.

Best regards,
${firstName} ${lastName}`.trim();
  }

  _generateWhyWorkHere(p) {
    const skills = Array.isArray(p.skills) ? p.skills.join(', ') : (p.skills || 'various areas');
    return `This opportunity aligns with my professional goals and allows me to leverage my expertise in ${skills} while contributing to impactful work. I am drawn to the culture of innovation and the opportunity to grow alongside a talented team.`;
  }

  _generateSalaryExpectations(p) {
    const ranges = { entry: '$45,000–$65,000', mid: '$65,000–$90,000', senior: '$90,000–$130,000', executive: '$130,000+' };
    return ranges[p.experienceLevel || 'mid'] || 'Negotiable based on responsibilities and benefits package';
  }

  _generateProjectDescription(p) {
    const skills     = Array.isArray(p.skills) ? p.skills.join(', ') : (p.skills || 'key areas');
    const experience = p.experience || 'the field';
    return `This project leverages my expertise in ${skills} to deliver impactful outcomes. With my experience in ${experience}, I am positioned to execute successfully, on time and within budget, using best practices and innovative approaches.`;
  }

  _generateBudgetJustification() {
    return `The requested budget reflects the scope and complexity of the project. Resources are allocated efficiently to maximise value, with each line item carefully aligned to project objectives and expected deliverables.`;
  }

  _generateImpactStatement(p) {
    const impact = p.impact || 'meaningful outcomes';
    const beneficiaries = p.beneficiaries || 'our community';
    const metrics = p.metrics || 'quantifiable measures';
    return `This project will deliver ${impact} for ${beneficiaries}, measured through ${metrics}. We anticipate significant positive change within the first year, with sustainable long-term benefits that extend beyond the project timeline.`;
  }

  _generateTimeline(p) {
    const duration = p.projectDuration || '12 months';
    const phases = p.phases || 'planning, implementation, and evaluation';
    return `The project will be completed over ${duration}, structured in clear phases: ${phases}. Each phase includes specific milestones and deliverables, ensuring steady progress and regular opportunities for assessment and adjustment.`;
  }

  _generateTeamDescription(p) {
    const teamSize = p.teamSize || 'dedicated team';
    const expertise = p.expertise || 'relevant expertise';
    const experience = p.teamExperience || 'extensive experience';
    return `Our ${teamSize} brings together ${expertise} and ${experience}. Team members have demonstrated success in similar projects, ensuring we have the skills and knowledge necessary to achieve project goals effectively.`;
  }

  _generateInnovationStatement(p) {
    const innovation = p.innovation || 'novel approach';
    const advantage = p.advantage || 'unique advantage';
    const market = p.targetMarket || 'underserved market';
    return `Our project introduces ${innovation} that provides ${advantage} in addressing critical needs. This approach fills a significant gap in the current landscape, particularly for ${market}, and represents a meaningful advancement beyond existing solutions.`;
  }

  _generateEventBio(p) {
    const name     = [p.firstName, p.lastName].filter(Boolean).join(' ') || 'I';
    const role     = p.jobTitle  || 'founder';
    const company  = p.company   || 'my startup';
    const industry = p.industry  || 'technology';
    return `${name} is a ${role} at ${company}, working in the ${industry} space. With a passion for innovation and building impactful products, ${name.split(' ')[0] || 'I'} is excited about connecting with the community and learning from this program.`;
  }

  _generateWhyAttend(p) {
    const company  = p.company  || 'our startup';
    const industry = p.industry || 'our sector';
    return `We are eager to connect with mentors, investors, and fellow founders who can help us accelerate growth for ${company}. The program's focus on ${industry} challenges closely matches where we need expertise and community support.`;
  }

  _generateElevatorPitch(p) {
    const company = p.company || 'our company';
    const problem = p.problem || 'a significant challenge';
    const solution = p.solution || 'an innovative solution';
    const market = p.market || 'a growing market';
    return `${company} is solving ${problem} with ${solution}. We're targeting ${market} and have already demonstrated strong early traction and market validation.`;
  }

  _generateProblemStatement(p) {
    const problem = p.problem || 'a critical industry challenge';
    const affected = p.affected || 'many organizations';
    const cost = p.cost || 'significant costs and inefficiencies';
    return `${problem} affects ${affected}, resulting in ${cost}. Current solutions are inadequate or non-existent, creating a clear opportunity for innovation and improvement.`;
  }

  _generateSolutionStatement(p) {
    const solution = p.solution || 'our innovative approach';
    const benefits = p.benefits || 'significant value';
    const differentiation = p.differentiation || 'unique advantages';
    return `${solution} delivers ${benefits} through ${differentiation}. Our approach is more effective, efficient, and scalable than existing alternatives, addressing the core needs of our target customers.`;
  }

  _generateTractionStatement(p) {
    const users = p.users || 'early adopters';
    const revenue = p.revenue || 'promising early revenue';
    const growth = p.growth || 'strong growth metrics';
    const partnerships = p.partnerships || 'strategic partnerships';
    return `We've gained traction with ${users}, generated ${revenue}, and achieved ${growth}. Our ${partnerships} validate our market approach and position us for accelerated growth.`;
  }

  // ─── Utility helpers ───────────────────────────────────────────────────────
  _hasFieldType(formRequirements, semanticType) {
    return (formRequirements?.fields || []).some(f => f.semanticType === semanticType);
  }

  _hasFieldMatching(formRequirements, pattern) {
    return (formRequirements?.fields || []).some(f =>
      pattern.test([(f.labels || []).join(' '), f.name || '', f.id || ''].join(' ').toLowerCase())
    );
  }

  _inferApplicationType(request) {
    const url = typeof window !== 'undefined' ? (window.location?.href || '') : '';
    if (/rsvp|event|register|attend|cohort|accelerator/.test(url.toLowerCase())) return 'event_registration';
    if (/job|career|position|employ/.test(url.toLowerCase()))   return 'job_application';
    if (/grant|funding|proposal/.test(url.toLowerCase()))        return 'grant_application';
    return 'general_form';
  }

  _extractFormRequirements(formRequirements) {
    if (!formRequirements?.fields) return { fields: [], type: 'unknown' };
    return {
      fields: (formRequirements.fields || []).map(field => ({
        semanticType:  field.semanticType,
        inputClass:    field.inputClass,
        labels:        field.labels,
        required:      field.required,
        primaryLabel:  field.primaryLabel,
        name:          field.name,
        id:            field.id,
      })),
      type:       this._classifyFormType(formRequirements.fields),
      wizard:     formRequirements.wizard,
      fieldCount: formRequirements.fields.length,
    };
  }

  _classifyFormType(fields = []) {
    const text = fields.map(f =>
      (f.labels?.join(' ') || '') + ' ' + (f.name || '') + ' ' + (f.id || '')
    ).join(' ').toLowerCase();

    if (/job|employment|position/.test(text))            return 'job_application';
    if (/grant|funding|proposal/.test(text))             return 'grant_application';
    if (/rsvp|attend|event|cohort|accelerator/.test(text)) return 'event_registration';
    if (/application|apply/.test(text))                  return 'application';
    return 'general_form';
  }

  _sanitizeProfile(profile) {
    if (!profile) return {};
    const sanitized = { ...profile };
    // Remove only genuinely sensitive payment/auth fields
    delete sanitized.password;
    delete sanitized.cardNumber;
    delete sanitized.cardCvv;
    delete sanitized.cardExpiry;
    return sanitized;
  }

  _detectPageType() {
    if (typeof window === 'undefined') return 'general';
    const domain = (window.location?.hostname || '').toLowerCase();
    if (domain.includes('linkedin') || domain.includes('indeed'))   return 'job_site';
    if (domain.includes('grants')   || domain.includes('funding'))  return 'grant_site';
    if (/rsvp|event|withgoogle|luma|eventbrite/.test(domain))       return 'event_site';
    if (document.querySelector('form'))                             return 'form_page';
    return 'general';
  }

  _generateCacheKey(request) {
    const urlSlug = typeof window !== 'undefined'
      ? this._safeBase64(window.location?.pathname || '').slice(0, 8)
      : '';
    const key = JSON.stringify({
      applicationType: request.applicationType,
      fieldCount:      request.formRequirements?.fields?.length,
      hasProfile:      !!request.userProfile,
      urlSlug,
    });
    return this._safeBase64(key).slice(0, 20);
  }

  _safeBase64(str) {
    try {
      return btoa(str);
    } catch (e) {
      // Handle Unicode by converting to UTF-8 first
      return btoa(unescape(encodeURIComponent(str)));
    }
  }

  _addToCache(key, value) {
    if (this.cache.size >= this.maxCacheSize) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, value);
  }

  _generateFallbackContent(request) {
    return {
      content:     this._sanitizeProfile(request.userProfile) || {},
      confidence:  0.5,
      suggestions: ['Using basic profile data — AI service temporarily unavailable'],
      error:       'AI service unavailable',
    };
  }
}

export { AIContentProcessor };
