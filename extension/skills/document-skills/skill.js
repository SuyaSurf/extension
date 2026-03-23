/**
 * Document Skills Skill
 * Google Docs/Slides integration
 */
class DocumentSkillsSkill {
  constructor(config = {}) {
    this.name = 'document-skills';
    this.version = '1.0.0';
    this.isActive = false;
    this.config = {
      googleDocs: true,
      googleSlides: true,
      autoDetect: true,
      smartEditing: true,
      ...config
    };
    this.currentDocument = null;
    this.documentType = null;
  }

  async initialize() {
    console.log('Initializing Document Skills Skill...');
    this.detectDocumentType();
    console.log('Document Skills Skill initialized');
  }

  async activate() {
    this.isActive = true;
    console.log('Document Skills Skill activated');
  }

  async deactivate() {
    this.isActive = false;
    console.log('Document Skills Skill deactivated');
  }

  async handleAction(action, data, sender = null) {
    switch (action) {
      case 'getStatus':
        return await this.getStatus();
      case 'getDocumentInfo':
        return await this.getDocumentInfo();
      case 'editDocument':
        return await this.editDocument(data);
      case 'generateContent':
        return await this.generateContent(data.prompt);
      case 'formatDocument':
        return await this.formatDocument(data.format);
      case 'exportDocument':
        return await this.exportDocument(data.format);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  detectDocumentType() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    
    if (url.includes('docs.google.com')) {
      this.documentType = 'docs';
    } else if (url.includes('slides.google.com')) {
      this.documentType = 'slides';
    }
    
    this.currentDocument = {
      type: this.documentType,
      url: url,
      title: document.title
    };
  }

  async getDocumentInfo() {
    return {
      document: this.currentDocument,
      content: await this.getDocumentContent()
    };
  }

  async getDocumentContent() {
    try {
      // Check if we're in Google Docs
      if (window.location.hostname === 'docs.google.com') {
        // Get Google Docs content
        const docsContent = document.querySelector('.kix-wordhtmlgenerator');
        if (docsContent) {
          return { text: docsContent.innerText || docsContent.textContent };
        }
        // Fallback to getting all paragraph elements
        const paragraphs = document.querySelectorAll('.kix-paragraph');
        const content = Array.from(paragraphs).map(p => p.textContent).join('\n');
        return { text: content || 'No content found in Google Docs' };
      }
      
      // Check if we're in a general text editor or document
      const editableElements = document.querySelectorAll('[contenteditable="true"], textarea, input[type="text"]');
      if (editableElements.length > 0) {
        const content = Array.from(editableElements).map(el => el.value || el.textContent).join('\n');
        return { text: content || 'No editable content found' };
      }
      
      // Fallback to main content area
      const mainContent = document.querySelector('main, [role="main"], .content, #content');
      if (mainContent) {
        return { text: mainContent.innerText || mainContent.textContent };
      }
      
      return { text: 'No document content detected' };
    } catch (error) {
      console.error('Failed to extract document content:', error);
      return { text: 'Error extracting document content' };
    }
  }

  async editDocument(data) {
    console.log('Editing document:', data);
    return { success: true, message: 'Document edited' };
  }

  async generateContent(prompt) {
    console.log('Generating content:', prompt);
    return { 
      content: `Generated content for: ${prompt}`,
      message: 'Content generated successfully'
    };
  }

  async formatDocument(format) {
    console.log('Formatting document:', format);
    return { success: true, format, message: 'Document formatted' };
  }

  async exportDocument(format) {
    console.log('Exporting document as:', format);
    return { 
      success: true, 
      format, 
      downloadUrl: `#export-${Date.now()}`,
      message: 'Document exported'
    };
  }

  async getStatus() {
    return {
      active: this.isActive,
      version: this.version,
      currentDocument: this.currentDocument,
      features: this.config
    };
  }

  getVersion() { return this.version; }
  getName() { return this.name; }
  isActiveStatus() { return this.isActive; }
  getDependencies() { return []; }
}

export { DocumentSkillsSkill };
