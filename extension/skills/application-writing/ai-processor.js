/* ─── ai-processor.js ─── */
class AIContentProcessor {
  constructor() {
    this.serverEndpoint = 'http://localhost:3000'; // Development server
    this.cache = new Map();
    this.maxCacheSize = 50;
  }

  async initialize(config = {}) {
    this.serverEndpoint = config.serverEndpoint || this.serverEndpoint;
    console.log('AI Content Processor initialized with endpoint:', this.serverEndpoint);
  }

  async generateContent(request) {
    const cacheKey = this.generateCacheKey(request);
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      // Build proper request payload
      const payload = {
        applicationType: request.applicationType || 'general_form',
        formRequirements: this.extractFormRequirements(request.formRequirements),
        userProfile: this.sanitizeProfile(request.userProfile),
        context: {
          url: typeof window !== 'undefined' && window.location ? window.location.href : '',
          title: typeof document !== 'undefined' ? document.title : '',
          pageType: this.detectPageType(),
          timestamp: Date.now(),
          ...request.context
        }
      };

      const response = await this.callServerAPI(payload);
      
      // Cache the result
      this.addToCache(cacheKey, response);
      
      return response;
    } catch (error) {
      console.error('AI content generation failed:', error);
      return this.generateFallbackContent(request);
    }
  }

  async callServerAPI(request) {
    try {
      const response = await fetch(`${this.serverEndpoint}/api/ai/generate-application`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Server API call failed:', error);
      throw error;
    }
  }

  generateClientSideContent(payload) {
    const { applicationType, formRequirements, userProfile } = payload;
    
    switch (applicationType) {
      case 'job_application':
        return this.generateJobApplicationContent(formRequirements, userProfile);
      case 'grant_application':
        return this.generateGrantApplicationContent(formRequirements, userProfile);
      case 'general_form':
        return this.generateGeneralFormContent(formRequirements, userProfile);
      default:
        return this.generateBasicContent(formRequirements, userProfile);
    }
  }

  generateJobApplicationContent(formRequirements, profile) {
    const content = {};
    
    // Generate cover letter text
    if (formRequirements.fields?.some(f => f.semanticType === 'message')) {
      content.message = this.generateCoverLetter(profile);
    }
    
    // Generate why you want to work here
    if (formRequirements.fields?.some(f => 
        f.labels?.some(l => l.toLowerCase().includes('why')) || 
        f.name?.toLowerCase().includes('why'))) {
      content.whyWorkHere = this.generateWhyWorkHere(profile);
    }
    
    // Generate salary expectations
    if (formRequirements.fields?.some(f => 
        f.labels?.some(l => l.toLowerCase().includes('salary')) || 
        f.name?.toLowerCase().includes('salary'))) {
      content.salary = this.generateSalaryExpectations(profile);
    }

    return {
      content,
      confidence: 0.8,
      suggestions: [
        'Review generated content before submission',
        'Customize for specific company culture'
      ]
    };
  }

  generateGrantApplicationContent(formRequirements, profile) {
    const content = {};
    
    // Generate project description
    if (formRequirements.fields?.some(f => f.semanticType === 'message')) {
      content.projectDescription = this.generateProjectDescription(profile);
    }
    
    // Generate budget justification
    if (formRequirements.fields?.some(f => 
        f.labels?.some(l => l.toLowerCase().includes('budget')))) {
      content.budgetJustification = this.generateBudgetJustification(profile);
    }

    return {
      content,
      confidence: 0.75,
      suggestions: [
        'Include specific metrics and outcomes',
        'Align with grant requirements'
      ]
    };
  }

  generateGeneralFormContent(formRequirements, profile) {
    const content = {};
    
    // Generate appropriate responses based on field types
    formRequirements.fields?.forEach(field => {
      if (field.semanticType && profile[field.semanticType]) {
        content[field.semanticType] = profile[field.semanticType];
      }
    });

    return {
      content,
      confidence: 0.9,
      suggestions: []
    };
  }

  generateBasicContent(formRequirements, profile) {
    return {
      content: profile,
      confidence: 0.7,
      suggestions: ['Verify all field mappings']
    };
  }

  generateCoverLetter(profile) {
    const { firstName, lastName, jobTitle, company, experience } = profile;
    
    return `Dear Hiring Manager,

I am writing to express my strong interest in this position at ${company || 'your company'}. With my background as ${jobTitle || 'a professional'} and extensive experience in ${experience || 'the field'}, I believe I would be a valuable addition to your team.

My skills and experience align well with the requirements of this role. I am particularly drawn to this opportunity because it allows me to leverage my expertise while contributing to meaningful projects.

I would welcome the opportunity to discuss how my background and skills would be an excellent match for this position. Thank you for your consideration.

Best regards,
${firstName || ''} ${lastName || ''}`;
  }

  generateWhyWorkHere(profile) {
    const { interests, skills } = profile;
    
    return `I am excited about this opportunity because it aligns perfectly with my professional goals and interests. ${company || 'Your company'}'s reputation for innovation and excellence makes it an ideal environment for me to contribute my skills in ${skills?.join(', ') || 'various areas'} while continuing to grow professionally. I am particularly drawn to the company culture and the opportunity to work on challenging projects that make a real impact.`;
  }

  generateSalaryExpectations(profile) {
    // Generate reasonable salary range based on experience level
    const baseRanges = {
      'entry': '$45,000 - $65,000',
      'mid': '$65,000 - $90,000', 
      'senior': '$90,000 - $130,000',
      'executive': '$130,000+'
    };
    
    const level = profile.experienceLevel || 'mid';
    return baseRanges[level] || 'Negotiable based on responsibilities and benefits';
  }

  generateProjectDescription(profile) {
    const { skills, experience } = profile;
    
    return `This project aims to leverage my expertise in ${skills?.join(', ') || 'key areas'} to deliver impactful results. With my experience in ${experience || 'the field'}, I am well-positioned to execute this project successfully, ensuring all objectives are met on time and within budget. The project will incorporate best practices and innovative approaches to maximize outcomes.`;
  }

  generateBudgetJustification(profile) {
    return `The requested budget is justified by the scope and complexity of the project. Resources will be allocated efficiently to ensure maximum value and impact. Each budget item has been carefully considered to align with project objectives and deliverables.`;
  }

  extractFormRequirements(formRequirements) {
    if (!formRequirements || !formRequirements.fields) {
      return { fields: [], type: 'unknown' };
    }

    return {
      fields: formRequirements.fields.map(field => ({
        semanticType: field.semanticType,
        inputClass: field.inputClass,
        labels: field.labels,
        required: field.required,
        primaryLabel: field.primaryLabel
      })),
      type: this.classifyFormType(formRequirements.fields),
      wizard: formRequirements.wizard,
      fieldCount: formRequirements.fields.length
    };
  }

  classifyFormType(fields) {
    const fieldText = fields.map(f => f.labels?.join(' ') + ' ' + f.name + ' ' + f.id).join(' ').toLowerCase();
    
    if (fieldText.includes('job') || fieldText.includes('employment') || fieldText.includes('position')) {
      return 'job_application';
    }
    if (fieldText.includes('grant') || fieldText.includes('funding') || fieldText.includes('proposal')) {
      return 'grant_application';
    }
    if (fieldText.includes('application') || fieldText.includes('apply')) {
      return 'application';
    }
    
    return 'general_form';
  }

  sanitizeProfile(profile) {
    // Remove sensitive data and only keep relevant fields
    const sanitized = { ...profile };
    
    // Remove passwords and sensitive financial info
    delete sanitized.password;
    delete sanitized.cardNumber;
    delete sanitized.cardCvv;
    delete sanitized.cardExpiry;
    
    return sanitized;
  }

  detectPageType() {
    const domain = typeof window !== 'undefined' && window.location ? window.location.hostname.toLowerCase() : '';
    
    if (domain.includes('linkedin') || domain.includes('indeed')) return 'job_site';
    if (domain.includes('grants') || domain.includes('funding')) return 'grant_site';
    if (document.querySelector('form')) return 'form_page';
    
    return 'general';
  }

  generateCacheKey(request) {
    const key = JSON.stringify({
      applicationType: request.applicationType,
      fieldCount: request.formRequirements?.fields?.length,
      hasProfile: !!request.userProfile
    });
    return btoa(key).slice(0, 16);
  }

  addToCache(key, value) {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  generateFallbackContent(request) {
    return {
      content: request.userProfile || {},
      confidence: 0.5,
      suggestions: ['Server unavailable - using basic profile data'],
      error: 'AI service temporarily unavailable'
    };
  }
}

export { AIContentProcessor };
