/* ─── profile-manager.js ─── */
class ProfileManager {
  constructor() {
    this.currentProfile = null;
    this.profiles = [];
    this.storageKey = 'suya_form_profiles';
    this.activeProfileKey = 'suya_active_form_profile';
  }

  async initialize() {
    await this.loadProfiles();
    await this.loadActiveProfile();
    console.log('Profile Manager initialized');
  }

  async loadProfiles() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      this.profiles = result[this.storageKey] || this.getDefaultProfiles();
    } catch (error) {
      console.error('Failed to load profiles:', error);
      this.profiles = this.getDefaultProfiles();
    }
  }

  async loadActiveProfile() {
    try {
      const result = await chrome.storage.local.get(this.activeProfileKey);
      const activeId = result[this.activeProfileKey];
      this.currentProfile = this.profiles.find(p => p.id === activeId) || this.profiles[0] || null;
    } catch (error) {
      console.error('Failed to load active profile:', error);
      this.currentProfile = this.profiles[0] || null;
    }
  }

  getDefaultProfiles() {
    return [{
      id: 'default',
      name: 'Default Profile',
      personalInfo: {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        country: '',
        dob: '',
        gender: ''
      },
      workExperience: [],
      education: [],
      skills: {
        technical: [],
        soft: [],
        languages: [],
        certifications: []
      },
      preferences: {
        tone: 'professional',
        style: 'formal',
        autoFillEnabled: true
      },
      documents: [],
      createdAt: Date.now(),
      isDefault: true
    }];
  }

  async saveProfile(profile) {
    try {
      const existingIndex = this.profiles.findIndex(p => p.id === profile.id);
      
      if (existingIndex >= 0) {
        this.profiles[existingIndex] = { ...profile, updatedAt: Date.now() };
      } else {
        profile.id = profile.id || this.generateId();
        profile.createdAt = Date.now();
        this.profiles.push(profile);
      }

      await chrome.storage.local.set({ [this.storageKey]: this.profiles });
      
      if (!this.currentProfile || profile.id === this.currentProfile.id) {
        await this.setActiveProfile(profile.id);
      }

      return { success: true, profile };
    } catch (error) {
      console.error('Failed to save profile:', error);
      return { success: false, error: error.message };
    }
  }

  async setActiveProfile(profileId) {
    try {
      this.currentProfile = this.profiles.find(p => p.id === profileId);
      if (this.currentProfile) {
        await chrome.storage.local.set({ [this.activeProfileKey]: profileId });
        return { success: true, profile: this.currentProfile };
      }
      return { success: false, error: 'Profile not found' };
    } catch (error) {
      console.error('Failed to set active profile:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteProfile(profileId) {
    try {
      const index = this.profiles.findIndex(p => p.id === profileId);
      if (index >= 0) {
        this.profiles.splice(index, 1);
        await chrome.storage.local.set({ [this.storageKey]: this.profiles });
        
        if (this.currentProfile?.id === profileId) {
          this.currentProfile = this.profiles[0] || null;
          if (this.currentProfile) {
            await chrome.storage.local.set({ [this.activeProfileKey]: this.currentProfile.id });
          }
        }
        
        return { success: true };
      }
      return { success: false, error: 'Profile not found' };
    } catch (error) {
      console.error('Failed to delete profile:', error);
      return { success: false, error: error.message };
    }
  }

  getCurrentProfile() {
    return this.currentProfile;
  }

  getAllProfiles() {
    return this.profiles;
  }

  getProfile(profileId) {
    return this.profiles.find(p => p.id === profileId);
  }

  async updateProfileField(profileId, fieldPath, value) {
    const profile = this.getProfile(profileId);
    if (!profile) return { success: false, error: 'Profile not found' };

    const pathParts = fieldPath.split('.');
    let current = profile;
    
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) {
        current[pathParts[i]] = {};
      }
      current = current[pathParts[i]];
    }
    
    current[pathParts[pathParts.length - 1]] = value;
    
    return await this.saveProfile(profile);
  }

  async extractFromCurrentForm() {
    if (!window.FormScanner) {
      return { success: false, error: 'Form scanner not available' };
    }

    try {
      const scanResult = window.FormScanner.scan();
      const extractedData = {};

      // Extract data from visible fields
      scanResult.visibleFields.forEach(field => {
        if (field.value && field.semanticType) {
          this.setNestedValue(extractedData, field.semanticType, field.value);
        } else if (field.value && field.primaryLabel) {
          const labelKey = this.labelToKey(field.primaryLabel);
          this.setNestedValue(extractedData, labelKey, field.value);
        }
      });

      return { success: true, data: extractedData };
    } catch (error) {
      console.error('Failed to extract form data:', error);
      return { success: false, error: error.message };
    }
  }

  setNestedValue(obj, key, value) {
    const pathParts = key.split('.');
    let current = obj;
    
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) {
        current[pathParts[i]] = {};
      }
      current = current[pathParts[i]];
    }
    
    current[pathParts[pathParts.length - 1]] = value;
  }

  labelToKey(label) {
    const labelLower = label.toLowerCase().trim();
    
    // Map common labels to profile keys
    const labelMap = {
      'first name': 'personalInfo.firstName',
      'last name': 'personalInfo.lastName',
      'email': 'personalInfo.email',
      'phone': 'personalInfo.phone',
      'address': 'personalInfo.address',
      'city': 'personalInfo.city',
      'state': 'personalInfo.state',
      'zip': 'personalInfo.zip',
      'postal code': 'personalInfo.zip',
      'country': 'personalInfo.country',
      'date of birth': 'personalInfo.dob',
      'birthday': 'personalInfo.dob',
      'gender': 'personalInfo.gender',
      'company': 'workExperience.company',
      'job title': 'workExperience.title',
      'position': 'workExperience.title',
      'website': 'personalInfo.website',
      'message': 'message',
      'comment': 'message',
      'description': 'message'
    };

    return labelMap[labelLower] || labelLower.replace(/\s+/g, '');
  }

  async createProfileFromForm(profileName) {
    const extraction = await this.extractFromCurrentForm();
    if (!extraction.success) {
      return extraction;
    }

    const newProfile = {
      id: this.generateId(),
      name: profileName || `Form Profile ${new Date().toLocaleDateString()}`,
      personalInfo: {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        country: '',
        dob: '',
        gender: '',
        website: '',
        ...extraction.data.personalInfo
      },
      workExperience: extraction.data.workExperience || [],
      education: extraction.data.education || [],
      skills: {
        technical: [],
        soft: [],
        languages: [],
        certifications: [],
        ...extraction.data.skills
      },
      preferences: {
        tone: 'professional',
        style: 'formal',
        autoFillEnabled: true
      },
      documents: [],
      message: extraction.data.message || '',
      subject: extraction.data.subject || '',
      createdAt: Date.now(),
      extractedFrom: window.location.href
    };

    return await this.saveProfile(newProfile);
  }

  generateId() {
    return 'profile_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
  }

  async exportProfile(profileId) {
    const profile = this.getProfile(profileId);
    if (!profile) {
      return { success: false, error: 'Profile not found' };
    }

    try {
      const dataStr = JSON.stringify(profile, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${profile.name.replace(/\s+/g, '_')}_profile.json`;
      link.click();
      
      URL.revokeObjectURL(url);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async importProfile(file) {
    try {
      const text = await file.text();
      const profileData = JSON.parse(text);
      
      // Validate profile structure
      if (!profileData.name || !profileData.personalInfo) {
        return { success: false, error: 'Invalid profile format' };
      }

      // Generate new ID to avoid conflicts
      profileData.id = this.generateId();
      profileData.importedAt = Date.now();
      
      return await this.saveProfile(profileData);
    } catch (error) {
      return { success: false, error: 'Failed to parse profile file' };
    }
  }

  getProfileStats() {
    return {
      totalProfiles: this.profiles.length,
      activeProfile: this.currentProfile?.name || 'None',
      averageCompleteness: this.calculateAverageCompleteness(),
      lastUpdated: Math.max(...this.profiles.map(p => p.updatedAt || p.createdAt || 0))
    };
  }

  calculateAverageCompleteness() {
    if (this.profiles.length === 0) return 0;
    
    const totalCompleteness = this.profiles.reduce((sum, profile) => {
      return sum + this.calculateProfileCompleteness(profile);
    }, 0);
    
    return Math.round(totalCompleteness / this.profiles.length);
  }

  calculateProfileCompleteness(profile) {
    let filledFields = 0;
    let totalFields = 0;

    // Count personal info fields (expanded list)
    const personalFields = ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country', 'dob', 'gender', 'website'];
    personalFields.forEach(field => {
      totalFields++;
      if (profile.personalInfo?.[field] && profile.personalInfo[field].trim()) filledFields++;
    });

    // Count work experience
    totalFields++;
    if (profile.workExperience?.length > 0) filledFields++;

    // Count education  
    totalFields++;
    if (profile.education?.length > 0) filledFields++;

    // Count skills sections
    const skillSections = ['technical', 'soft', 'languages', 'certifications'];
    skillSections.forEach(section => {
      totalFields++;
      if (profile.skills?.[section]?.length > 0) filledFields++;
    });

    return totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
  }
}

export { ProfileManager };
