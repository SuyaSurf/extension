/**
 * Template Manager for Application Writing Skill
 * Handles storage, retrieval, and application of form templates
 */

export class TemplateManager {
  constructor() {
    this.templates = new Map();
    this.storageKey = 'suya_application_templates';
    this.initialized = false;
  }

  async initialize() {
    try {
      await this.loadTemplates();
      this.initialized = true;
      console.log('[TemplateManager] Initialized');
    } catch (error) {
      console.error('[TemplateManager] Failed to initialize:', error);
      throw error;
    }
  }

  async loadTemplates() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      const templates = result[this.storageKey] || {};
      
      this.templates.clear();
      for (const [id, template] of Object.entries(templates)) {
        this.templates.set(id, template);
      }
      
      console.log(`[TemplateManager] Loaded ${this.templates.size} templates`);
    } catch (error) {
      console.error('[TemplateManager] Failed to load templates:', error);
      this.templates.clear();
    }
  }

  async saveTemplate(templateData) {
    const {
      name,
      description,
      formFields,
      metadata = {},
      category = 'general'
    } = templateData;

    const template = {
      id: templateData.id || this.generateId(),
      name: name.trim(),
      description: description?.trim() || '',
      category,
      formFields: this.normalizeFormFields(formFields),
      metadata: {
        ...metadata,
        createdAt: templateData.id ? templateData.metadata?.createdAt : Date.now(),
        updatedAt: Date.now(),
        version: (templateData.metadata?.version || 1) + (templateData.id ? 1 : 0)
      },
      usageCount: templateData.usageCount || 0
    };

    // Validate template
    if (!template.name) {
      throw new Error('Template name is required');
    }

    if (!template.formFields || template.formFields.length === 0) {
      throw new Error('Template must have at least one form field');
    }

    // Save to memory
    this.templates.set(template.id, template);

    // Persist to storage
    await this.persistTemplates();

    console.log(`[TemplateManager] Saved template: ${template.name} (${template.id})`);
    return template;
  }

  async applyTemplate(templateId, formData = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Increment usage count
    template.usageCount++;
    template.metadata.lastUsed = Date.now();
    await this.persistTemplates();

    // Generate filled form data
    const filledFields = {};
    const fieldMappings = {};

    for (const field of template.formFields) {
      let value = field.defaultValue || '';

      // Try to match with provided form data
      if (formData[field.name]) {
        value = formData[field.name];
      } else if (field.selector) {
        // Try to find matching field in current form
        const matchedValue = this.findMatchingFieldValue(field.selector, formData);
        if (matchedValue) {
          value = matchedValue;
        }
      }

      // Apply transformations
      if (field.transformations && value) {
        value = this.applyTransformations(value, field.transformations);
      }

      filledFields[field.name] = value;
      
      if (field.selector) {
        fieldMappings[field.selector] = {
          name: field.name,
          value,
          type: field.type,
          required: field.required
        };
      }
    }

    console.log(`[TemplateManager] Applied template: ${template.name} to ${Object.keys(filledFields).length} fields`);
    
    return {
      template,
      filledFields,
      fieldMappings,
      appliedAt: Date.now()
    };
  }

  async deleteTemplate(templateId) {
    if (!this.templates.has(templateId)) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const template = this.templates.get(templateId);
    this.templates.delete(templateId);
    await this.persistTemplates();

    console.log(`[TemplateManager] Deleted template: ${template.name} (${templateId})`);
    return template;
  }

  async updateTemplate(templateId, updates) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const updatedTemplate = {
      ...template,
      ...updates,
      id: templateId, // Preserve ID
      metadata: {
        ...template.metadata,
        ...updates.metadata,
        updatedAt: Date.now(),
        version: template.metadata.version + 1
      }
    };

    // Re-validate if critical fields changed
    if (updates.name !== undefined && !updatedTemplate.name.trim()) {
      throw new Error('Template name cannot be empty');
    }

    this.templates.set(templateId, updatedTemplate);
    await this.persistTemplates();

    console.log(`[TemplateManager] Updated template: ${updatedTemplate.name} (${templateId})`);
    return updatedTemplate;
  }

  getTemplate(templateId) {
    return this.templates.get(templateId) || null;
  }

  getAllTemplates() {
    return Array.from(this.templates.values());
  }

  getTemplatesByCategory(category) {
    return this.getAllTemplates().filter(template => template.category === category);
  }

  searchTemplates(query) {
    const searchTerm = query.toLowerCase();
    return this.getAllTemplates().filter(template => 
      template.name.toLowerCase().includes(searchTerm) ||
      template.description.toLowerCase().includes(searchTerm) ||
      template.category.toLowerCase().includes(searchTerm)
    );
  }

  getTemplateCategories() {
    const categories = new Set();
    for (const template of this.templates.values()) {
      categories.add(template.category);
    }
    return Array.from(categories).sort();
  }

  getTemplateStats() {
    const templates = this.getAllTemplates();
    const categories = this.getTemplateCategories();
    
    return {
      totalTemplates: templates.length,
      totalCategories: categories.length,
      totalUsage: templates.reduce((sum, tpl) => sum + tpl.usageCount, 0),
      averageUsage: templates.length > 0 ? templates.reduce((sum, tpl) => sum + tpl.usageCount, 0) / templates.length : 0,
      mostUsed: templates.sort((a, b) => b.usageCount - a.usageCount)[0],
      recentlyUsed: templates
        .filter(tpl => tpl.metadata.lastUsed)
        .sort((a, b) => b.metadata.lastUsed - a.metadata.lastUsed)[0],
      recentlyCreated: templates
        .sort((a, b) => b.metadata.createdAt - a.metadata.createdAt)[0]
    };
  }

  async exportTemplates(templateIds = null) {
    let templatesToExport;
    
    if (templateIds) {
      templatesToExport = templateIds.map(id => this.templates.get(id)).filter(Boolean);
    } else {
      templatesToExport = this.getAllTemplates();
    }

    const exportData = {
      version: '1.0',
      exportedAt: Date.now(),
      templates: templatesToExport,
      count: templatesToExport.length
    };

    return exportData;
  }

  async importTemplates(importData, overwrite = false) {
    const { templates: importedTemplates, version } = importData;
    
    if (!Array.isArray(importedTemplates)) {
      throw new Error('Invalid import data: templates array is required');
    }

    const results = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    for (const templateData of importedTemplates) {
      try {
        // Generate new ID to avoid conflicts unless overwriting
        const template = {
          ...templateData,
          id: overwrite ? templateData.id : this.generateId(),
          metadata: {
            ...templateData.metadata,
            importedAt: Date.now(),
            updatedAt: Date.now()
          }
        };

        // Check for existing template with same name
        const existing = this.findTemplateByName(template.name);
        if (existing && !overwrite) {
          results.skipped++;
          continue;
        }

        await this.saveTemplate(template);
        results.imported++;
      } catch (error) {
        results.errors.push({
          template: templateData.name,
          error: error.message
        });
      }
    }

    console.log(`[TemplateManager] Import completed: ${results.imported} imported, ${results.skipped} skipped, ${results.errors.length} errors`);
    return results;
  }

  // Private helper methods
  generateId() {
    return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  normalizeFormFields(formFields) {
    if (!Array.isArray(formFields)) {
      return [];
    }

    return formFields.map(field => ({
      name: field.name || '',
      selector: field.selector || '',
      type: field.type || 'text',
      required: Boolean(field.required),
      defaultValue: field.defaultValue || '',
      placeholder: field.placeholder || '',
      options: field.options || [],
      transformations: field.transformations || [],
      validation: field.validation || {},
      ...field
    }));
  }

  findMatchingFieldValue(selector, formData) {
    // Simple implementation - could be enhanced with more sophisticated matching
    for (const [fieldName, value] of Object.entries(formData)) {
      if (fieldName.toLowerCase().includes(selector.toLowerCase()) || 
          selector.toLowerCase().includes(fieldName.toLowerCase())) {
        return value;
      }
    }
    return null;
  }

  applyTransformations(value, transformations) {
    let transformedValue = value;
    
    for (const transform of transformations) {
      switch (transform.type) {
        case 'uppercase':
          transformedValue = transformedValue.toString().toUpperCase();
          break;
        case 'lowercase':
          transformedValue = transformedValue.toString().toLowerCase();
          break;
        case 'capitalize':
          transformedValue = transformedValue.toString().charAt(0).toUpperCase() + 
                            transformedValue.toString().slice(1).toLowerCase();
          break;
        case 'trim':
          transformedValue = transformedValue.toString().trim();
          break;
        case 'replace':
          transformedValue = transformedValue.toString().replace(
            new RegExp(transform.pattern, transform.flags || 'g'), 
            transform.replacement
          );
          break;
        case 'format':
          if (transform.format) {
            transformedValue = transform.format.replace(/\{value\}/g, transformedValue);
          }
          break;
      }
    }
    
    return transformedValue;
  }

  findTemplateByName(name) {
    const normalizedName = name.toLowerCase().trim();
    for (const template of this.templates.values()) {
      if (template.name.toLowerCase().trim() === normalizedName) {
        return template;
      }
    }
    return null;
  }

  async persistTemplates() {
    try {
      const templatesObj = {};
      for (const [id, template] of this.templates) {
        templatesObj[id] = template;
      }
      
      await chrome.storage.local.set({ [this.storageKey]: templatesObj });
    } catch (error) {
      console.error('[TemplateManager] Failed to persist templates:', error);
      throw error;
    }
  }

  async cleanup() {
    this.templates.clear();
    this.initialized = false;
  }
}
