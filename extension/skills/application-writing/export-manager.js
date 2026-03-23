/**
 * Export Manager for Application Writing Skill
 * Handles exporting and downloading profiles, history, templates, and fill data
 */

export class ExportManager {
  constructor(profileManager, historyManager, templateManager) {
    this.profileManager = profileManager;
    this.historyManager = historyManager;
    this.templateManager = templateManager;
  }

  async exportProfiles(profileIds = null) {
    try {
      const profiles = profileIds 
        ? profileIds.map(id => this.profileManager.getProfile(id)).filter(Boolean)
        : this.profileManager.getAllProfiles();

      const exportData = {
        version: '1.0',
        type: 'profiles',
        exportedAt: Date.now(),
        profiles: profiles.map(profile => ({
          ...profile,
          // Sanitize sensitive data if needed
          data: this.sanitizeProfileData(profile.data)
        })),
        count: profiles.length
      };

      return exportData;
    } catch (error) {
      console.error('[ExportManager] Failed to export profiles:', error);
      throw error;
    }
  }

  async exportHistory(options = {}) {
    try {
      const { 
        projectId, 
        dateRange, 
        includeCorrections = true,
        includeMetadata = true 
      } = options;

      let records = [];

      if (projectId) {
        records = this.historyManager.getProjectRecords(projectId);
      } else {
        // Get all records (this would need to be implemented in ApplicationHistory)
        records = this.historyManager.getAllRecords() || [];
      }

      // Filter by date range if specified
      if (dateRange) {
        const { start, end } = dateRange;
        records = records.filter(record => 
          record.timestamp >= start && record.timestamp <= end
        );
      }

      const exportData = {
        version: '1.0',
        type: 'history',
        exportedAt: Date.now(),
        options,
        records: records.map(record => {
          const exportRecord = {
            id: record.id,
            projectId: record.projectId,
            timestamp: record.timestamp,
            url: record.url,
            formType: record.formType,
            fields: record.fields
          };

          if (includeCorrections) {
            exportRecord.corrections = record.corrections;
          }

          if (includeMetadata) {
            exportRecord.metadata = record.metadata;
          }

          return exportRecord;
        }),
        count: records.length
      };

      return exportData;
    } catch (error) {
      console.error('[ExportManager] Failed to export history:', error);
      throw error;
    }
  }

  async exportTemplates(templateIds = null) {
    try {
      return await this.templateManager.exportTemplates(templateIds);
    } catch (error) {
      console.error('[ExportManager] Failed to export templates:', error);
      throw error;
    }
  }

  async exportFillData(sessionId = null) {
    try {
      // Get recent fill results from the skill
      const fillData = sessionId 
        ? this.getFillDataForSession(sessionId)
        : this.getAllFillData();

      const exportData = {
        version: '1.0',
        type: 'fill-data',
        exportedAt: Date.now(),
        sessionId,
        fills: fillData.map(fill => ({
          id: fill.id,
          timestamp: fill.timestamp,
          url: fill.url,
          formType: fill.formType,
          fields: fill.fields,
          success: fill.success,
          errors: fill.errors,
          duration: fill.duration
        })),
        count: fillData.length
      };

      return exportData;
    } catch (error) {
      console.error('[ExportManager] Failed to export fill data:', error);
      throw error;
    }
  }

  async exportAll(options = {}) {
    try {
      const { includeProfiles = true, includeHistory = true, includeTemplates = true } = options;

      const exportData = {
        version: '1.0',
        type: 'complete',
        exportedAt: Date.now(),
        options,
        data: {}
      };

      if (includeProfiles) {
        exportData.data.profiles = await this.exportProfiles();
      }

      if (includeHistory) {
        exportData.data.history = await this.exportHistory(options.historyOptions);
      }

      if (includeTemplates) {
        exportData.data.templates = await this.exportTemplates();
      }

      return exportData;
    } catch (error) {
      console.error('[ExportManager] Failed to export all data:', error);
      throw error;
    }
  }

  async downloadFile(exportData, filename = null) {
    try {
      // Generate filename if not provided
      if (!filename) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        filename = `suya-export-${exportData.type}-${timestamp}.json`;
      }

      // Create blob
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });

      // Create download URL
      const url = URL.createObjectURL(blob);

      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up
      URL.revokeObjectURL(url);

      console.log(`[ExportManager] Downloaded: ${filename}`);
      return { success: true, filename };
    } catch (error) {
      console.error('[ExportManager] Failed to download file:', error);
      throw error;
    }
  }

  async generateCSVExport(exportData, type) {
    try {
      let csvContent = '';
      let filename = '';

      switch (type) {
        case 'profiles':
          csvContent = this.profilesToCSV(exportData.profiles);
          filename = `suya-profiles-${new Date().toISOString().slice(0, 10)}.csv`;
          break;

        case 'history':
          csvContent = this.historyToCSV(exportData.records);
          filename = `suya-history-${new Date().toISOString().slice(0, 10)}.csv`;
          break;

        case 'templates':
          csvContent = this.templatesToCSV(exportData.templates);
          filename = `suya-templates-${new Date().toISOString().slice(0, 10)}.csv`;
          break;

        case 'fill-data':
          csvContent = this.fillDataToCSV(exportData.fills);
          filename = `suya-fills-${new Date().toISOString().slice(0, 10)}.csv`;
          break;

        default:
          throw new Error(`Unsupported CSV export type: ${type}`);
      }

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);

      console.log(`[ExportManager] Downloaded CSV: ${filename}`);
      return { success: true, filename };
    } catch (error) {
      console.error('[ExportManager] Failed to generate CSV:', error);
      throw error;
    }
  }

  // Private helper methods
  sanitizeProfileData(data) {
    // Remove or mask sensitive fields if needed
    const sanitized = { ...data };
    
    // Example: mask password fields
    if (sanitized.password) {
      sanitized.password = '***MASKED***';
    }

    // Add any other sanitization logic here
    return sanitized;
  }

  profilesToCSV(profiles) {
    const headers = ['ID', 'Name', 'Email', 'Phone', 'Created', 'Last Used', 'Field Count'];
    const rows = profiles.map(profile => [
      profile.id,
      profile.name || '',
      profile.data?.email || '',
      profile.data?.phone || '',
      new Date(profile.createdAt).toISOString(),
      profile.lastUsed ? new Date(profile.lastUsed).toISOString() : '',
      Object.keys(profile.data || {}).length
    ]);

    return this.arrayToCSV([headers, ...rows]);
  }

  historyToCSV(records) {
    const headers = ['ID', 'Project ID', 'Timestamp', 'URL', 'Form Type', 'Field Count', 'Success'];
    const rows = records.map(record => [
      record.id,
      record.projectId || '',
      new Date(record.timestamp).toISOString(),
      record.url || '',
      record.formType || '',
      Object.keys(record.fields || {}).length,
      record.success || 'true'
    ]);

    return this.arrayToCSV([headers, ...rows]);
  }

  templatesToCSV(templates) {
    const headers = ['ID', 'Name', 'Category', 'Description', 'Field Count', 'Usage Count', 'Created', 'Last Used'];
    const rows = templates.map(template => [
      template.id,
      template.name,
      template.category,
      template.description,
      template.formFields?.length || 0,
      template.usageCount || 0,
      new Date(template.metadata.createdAt).toISOString(),
      template.metadata.lastUsed ? new Date(template.metadata.lastUsed).toISOString() : ''
    ]);

    return this.arrayToCSV([headers, ...rows]);
  }

  fillDataToCSV(fills) {
    const headers = ['ID', 'Timestamp', 'URL', 'Form Type', 'Field Count', 'Success', 'Duration (ms)'];
    const rows = fills.map(fill => [
      fill.id,
      new Date(fill.timestamp).toISOString(),
      fill.url || '',
      fill.formType || '',
      Object.keys(fill.fields || {}).length,
      fill.success ? 'true' : 'false',
      fill.duration || 0
    ]);

    return this.arrayToCSV([headers, ...rows]);
  }

  arrayToCSV(data) {
    return data
      .map(row => 
        row
          .map(cell => {
            // Escape quotes and commas
            const cellStr = cell.toString();
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
              return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
          })
          .join(',')
      )
      .join('\n');
  }

  getFillDataForSession(sessionId) {
    // Get fill data for a specific session
    // This would typically be stored in a temporary session cache
    try {
      if (typeof sessionStorage !== 'undefined') {
        const sessionKey = `suya_fill_session_${sessionId}`;
        const sessionData = sessionStorage.getItem(sessionKey);
        return sessionData ? JSON.parse(sessionData) : [];
      }
    } catch (e) {
      console.warn('[ExportManager] SessionStorage not available');
    }
    return [];
  }

  getAllFillData() {
    // Get all recent fill data from localStorage or memory
    try {
      if (typeof localStorage !== 'undefined') {
        const fillData = localStorage.getItem('suya_fill_data_all');
        return fillData ? JSON.parse(fillData) : [];
      }
    } catch (e) {
      console.warn('[ExportManager] LocalStorage not available');
    }
    return [];
  }

  async getExportSummary() {
    try {
      const profiles = this.profileManager.getAllProfiles();
      const templates = this.templateManager.getAllTemplates();
      const historyStats = this.getHistoryStats();

      return {
        profiles: {
          count: profiles.length,
          totalFields: profiles.reduce((sum, p) => sum + Object.keys(p.data || {}).length, 0),
          lastUpdated: profiles.length > 0 ? Math.max(...profiles.map(p => p.lastUsed || p.createdAt)) : null
        },
        templates: {
          count: templates.length,
          totalUsage: templates.reduce((sum, t) => sum + (t.usageCount || 0), 0),
          categories: this.templateManager.getTemplateCategories().length,
          lastUpdated: templates.length > 0 ? Math.max(...templates.map(t => t.metadata.updatedAt)) : null
        },
        history: historyStats
      };
    } catch (error) {
      console.error('[ExportManager] Failed to get export summary:', error);
      throw error;
    }
  }

  getHistoryStats() {
    try {
      // Get data from application history
      if (window.ApplicationHistory) {
        const history = new window.ApplicationHistory();
        const stats = history.getStats();
        return stats;
      }
      
      // Fallback: calculate from localStorage
      const stats = {
        totalRecords: 0,
        totalProjects: 0,
        dateRange: null,
        lastActivity: null
      };
      
      // Count projects
      const projects = Object.keys(localStorage).filter(key => key.startsWith('project_'));
      stats.totalProjects = projects.length;
      
      // Count records and find date range
      let earliestDate = null;
      let latestDate = null;
      
      projects.forEach(projectKey => {
        try {
          const project = JSON.parse(localStorage.getItem(projectKey) || '{}');
          if (project.recordIds) {
            stats.totalRecords += project.recordIds.length;
          }
          
          if (project.createdAt) {
            const created = new Date(project.createdAt);
            if (!earliestDate || created < earliestDate) earliestDate = created;
            if (!latestDate || created > latestDate) latestDate = created;
          }
          
          if (project.updatedAt) {
            const updated = new Date(project.updatedAt);
            if (!latestDate || updated > latestDate) latestDate = updated;
          }
        } catch (e) {
          // Skip invalid projects
        }
      });
      
      if (earliestDate && latestDate) {
        stats.dateRange = {
          start: earliestDate.toISOString(),
          end: latestDate.toISOString()
        };
      }
      
      stats.lastActivity = latestDate ? latestDate.toISOString() : null;
      
      return stats;
    } catch (error) {
      console.error('Failed to get history stats:', error);
      return {
        totalRecords: 0,
        totalProjects: 0,
        dateRange: null,
        lastActivity: null,
        error: error.message
      };
    }
  }
}
