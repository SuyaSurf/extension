import React, { useState } from 'react';

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'daily' | 'analysis' | 'learning' | 'automation';
  handler: () => void;
}

interface QuickActionsSectionProps {
  className?: string;
}

const QuickActionsSection: React.FC<QuickActionsSectionProps> = ({ className }) => {
  const [loading, setLoading] = useState<string | null>(null);

  const actions: QuickAction[] = [
    {
      id: 'daily-briefing',
      title: 'Daily Briefing',
      description: 'Get personalized news and insights',
      icon: '📈',
      category: 'daily',
      handler: () => handleQuickAction('START_DAILY_BRIEFING')
    },
    {
      id: 'fill-form',
      title: 'Smart Form Fill',
      description: 'AI-powered form filling',
      icon: '📝',
      category: 'automation',
      handler: () => handleQuickAction('FILL_CURRENT_FORM')
    },
    {
      id: 'analyze-page',
      title: 'Analyze Page',
      description: 'AI analysis of current page',
      icon: '🔍',
      category: 'analysis',
      handler: () => handleQuickAction('ANALYZE_CURRENT_PAGE')
    },
    {
      id: 'voice-commands',
      title: 'Voice Commands',
      description: 'Start voice interaction',
      icon: '🎤',
      category: 'automation',
      handler: () => handleQuickAction('START_VOICE')
    },
    {
      id: 'skill-gap',
      title: 'Skill Gap Analysis',
      description: 'Identify learning opportunities',
      icon: '🎯',
      category: 'learning',
      handler: () => handleQuickAction('SKILL_GAP_ANALYSIS')
    },
    {
      id: 'trending',
      title: 'Trending Topics',
      description: 'See what\'s trending in your field',
      icon: '🔥',
      category: 'analysis',
      handler: () => handleQuickAction('SHOW_TRENDING')
    }
  ];

  const handleQuickAction = async (actionType: string) => {
    setLoading(actionType);
    
    try {
      // Send message to service worker
      const response = await chrome.runtime.sendMessage({ type: actionType });
      
      if (response && response.ok) {
        // Show success feedback
        showFeedback('Action started successfully!', 'success');
      } else {
        showFeedback('Action failed. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Quick action error:', error);
      showFeedback('Action failed. Please try again.', 'error');
    } finally {
      setLoading(null);
    }
  };

  const showFeedback = (message: string, type: 'success' | 'error') => {
    // Create a temporary toast notification
    const toast = document.createElement('div');
    toast.className = `quick-action-toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      animation: slideIn 0.3s ease;
      background: ${type === 'success' ? '#4CAF50' : '#FF4444'};
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  const categoryIcons = {
    daily: '📅',
    analysis: '📊',
    learning: '🎓',
    automation: '⚡'
  };

  const categoryColors = {
    daily: '#FF6B35',
    analysis: '#4FC3F7',
    learning: '#81C784',
    automation: '#FFB74D'
  };

  const actionsByCategory = actions.reduce((acc, action) => {
    if (!acc[action.category]) {
      acc[action.category] = [];
    }
    acc[action.category].push(action);
    return acc;
  }, {} as Record<string, QuickAction[]>);

  return (
    <section className={`quick-actions-section ${className || ''}`}>
      <div className="section-header">
        <h2>⚡ Quick Actions</h2>
        <p>Launch AI-powered tools instantly</p>
      </div>

      <div className="actions-grid">
        {Object.entries(actionsByCategory).map(([category, categoryActions]) => (
          <div key={category} className="category-group">
            <div className="category-header">
              <span className="category-icon">{categoryIcons[category as keyof typeof categoryIcons]}</span>
              <h3>{category.charAt(0).toUpperCase() + category.slice(1)}</h3>
              <div 
                className="category-accent"
                style={{ backgroundColor: categoryColors[category as keyof typeof categoryColors] }}
              />
            </div>
            
            <div className="category-actions">
              {categoryActions.map(action => (
                <button
                  key={action.id}
                  className={`action-btn ${loading === action.id.replace('-', '') ? 'loading' : ''}`}
                  onClick={action.handler}
                  disabled={loading !== null}
                >
                  <div className="action-icon">{action.icon}</div>
                  <div className="action-content">
                    <span className="action-title">{action.title}</span>
                    <span className="action-description">{action.description}</span>
                  </div>
                  {loading === action.id.replace('-', '') && (
                    <div className="action-spinner" />
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .quick-actions-section {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          padding: 24px;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .section-header {
          margin-bottom: 24px;
        }
        .section-header h2 {
          margin: 0 0 8px;
          font-size: 24px;
          font-weight: 700;
        }
        .section-header p {
          margin: 0;
          opacity: 0.8;
          font-size: 16px;
        }
        .actions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
        }
        .category-group {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 20px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .category-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          position: relative;
        }
        .category-icon {
          font-size: 24px;
        }
        .category-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }
        .category-accent {
          position: absolute;
          bottom: -8px;
          left: 0;
          height: 2px;
          width: 40px;
          border-radius: 1px;
        }
        .category-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .action-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          position: relative;
          overflow: hidden;
        }
        .action-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
        }
        .action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .action-btn.loading {
          pointer-events: none;
        }
        .action-icon {
          font-size: 24px;
          flex-shrink: 0;
        }
        .action-content {
          flex: 1;
        }
        .action-title {
          display: block;
          font-weight: 600;
          font-size: 16px;
          margin-bottom: 4px;
        }
        .action-description {
          display: block;
          font-size: 14px;
          opacity: 0.8;
          line-height: 1.4;
        }
        .action-spinner {
          position: absolute;
          top: 50%;
          right: 16px;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: translateY(-50%) rotate(360deg); }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `}</style>
    </section>
  );
};

export default QuickActionsSection;
