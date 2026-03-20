import React, { useState } from 'react';
import { SuyaExpression, SuyaMode } from '@/components/SuyaBot';

interface WelcomeStepProps {
  guideStep: (expression: SuyaExpression, message: string, mode?: SuyaMode) => void;
  nextStep: () => void;
  completeStep: (stepName: string) => void;
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({ guideStep, nextStep, completeStep }) => {
  const [currentExpression, setCurrentExpression] = useState<SuyaExpression>('happy');
  const [showExpressionGuide, setShowExpressionGuide] = useState(false);

  const expressions: Array<{
    name: SuyaExpression;
    description: string;
    usage: string;
    icon: string;
  }> = [
    {
      name: 'happy',
      description: 'Joyful and engaged',
      usage: 'Success, completion, positive interactions',
      icon: '😊'
    },
    {
      name: 'thinking',
      description: 'Light processing',
      usage: 'Analysis, consideration, planning',
      icon: '🤔'
    },
    {
      name: 'thinking_hard',
      description: 'Deep concentration',
      usage: 'Complex tasks, problem-solving',
      icon: '🧠'
    },
    {
      name: 'listening',
      description: 'Paying attention',
      usage: 'Voice input, understanding requests',
      icon: '👂'
    },
    {
      name: 'eating',
      description: 'Processing information',
      usage: 'Working, analyzing, learning',
      icon: '🍢'
    },
    {
      name: 'shocked',
      description: 'Surprised or concerned',
      usage: 'Errors, warnings, unexpected events',
      icon: '😲'
    },
    {
      name: 'sleeping',
      description: 'Resting mode',
      usage: 'Inactive, powered down',
      icon: '😴'
    },
    {
      name: 'neutral',
      description: 'Default state',
      usage: 'Waiting, ready to help',
      icon: '😐'
    }
  ];

  const modes: Array<{
    name: SuyaMode;
    description: string;
    usage: string;
    icon: string;
  }> = [
    {
      name: 'awake',
      description: 'Active and ready',
      usage: 'When you\'re interacting or the bot is actively helping',
      icon: '⚡'
    },
    {
      name: 'idle',
      description: 'Resting but available',
      usage: 'Default state when not actively engaged',
      icon: '🌊'
    },
    {
      name: 'sleeping',
      description: 'Powered down',
      usage: 'When you want the bot to rest',
      icon: '🌙'
    }
  ];

  const triggerExpression = (expression: SuyaExpression) => {
    setCurrentExpression(expression);
    guideStep(expression, `This is my ${expression} expression!`);
  };

  const startExpressionDemo = () => {
    setShowExpressionGuide(true);
    guideStep('happy', 'Let me show you all my expressions and what they mean!');
  };

  const completeWelcome = () => {
    completeStep('welcome');
    guideStep('happy', 'Great! Now let\'s discover your interests to personalize your experience.');
    nextStep();
  };

  return (
    <div className="welcome-step">
      <div className="welcome-content">
        <h1>Welcome to Suya Bot!</h1>
        <p className="welcome-subtitle">
          I'm your AI companion that helps you grow by curating personalized content 
          and assisting with your daily tasks. Let me show you how I express myself!
        </p>

        {!showExpressionGuide ? (
          <div className="welcome-intro">
            <div className="intro-features">
              <div className="feature-card">
                <div className="feature-icon">🧠</div>
                <h3>Smart Personalization</h3>
                <p>I learn from your interests to curate content that helps you grow</p>
              </div>
              
              <div className="feature-card">
                <div className="feature-icon">📰</div>
                <h3>Growth-Focused News</h3>
                <p>News and articles selected specifically for your professional development</p>
              </div>
              
              <div className="feature-card">
                <div className="feature-icon">🤖</div>
                <h3>Intelligent Assistance</h3>
                <p>Form filling, research, and task automation with personality</p>
              </div>
            </div>

            <button 
              className="demo-btn primary"
              onClick={startExpressionDemo}
            >
              Meet Suya Bot's Personality
            </button>
          </div>
        ) : (
          <div className="expression-guide">
            <h2>Suya Bot's Expressions & Modes</h2>
            <p className="guide-intro">
              I use different expressions and modes to communicate what I'm doing and feeling. 
              Try clicking on each one to see them in action!
            </p>

            <div className="expressions-grid">
              <h3>Expressions</h3>
              <div className="expression-cards">
                {expressions.map(expr => (
                  <div 
                    key={expr.name}
                    className={`expression-card ${currentExpression === expr.name ? 'active' : ''}`}
                    onClick={() => triggerExpression(expr.name)}
                  >
                    <div className="expr-icon">{expr.icon}</div>
                    <div className="expr-info">
                      <h4>{expr.name}</h4>
                      <p>{expr.description}</p>
                      <small>{expr.usage}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modes-grid">
              <h3>Modes</h3>
              <div className="mode-cards">
                {modes.map(mode => (
                  <div 
                    key={mode.name}
                    className="mode-card"
                    onClick={() => guideStep('happy', `This is ${mode.name} mode: ${mode.description}`)}
                  >
                    <div className="mode-icon">{mode.icon}</div>
                    <div className="mode-info">
                      <h4>{mode.name}</h4>
                      <p>{mode.description}</p>
                      <small>{mode.usage}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="guide-actions">
              <button 
                className="action-btn primary"
                onClick={completeWelcome}
              >
                Continue to Personalization
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export { WelcomeStep };
