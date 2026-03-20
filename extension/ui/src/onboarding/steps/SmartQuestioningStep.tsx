import React, { useState } from 'react';
import { SuyaExpression, SuyaMode } from '@/components/SuyaBot';
import { UserProfile } from '../OnboardingFlow';

interface SmartQuestioningStepProps {
  guideStep: (expression: SuyaExpression, message: string, mode?: SuyaMode) => void;
  nextStep: () => void;
  completeStep: (stepName: string) => void;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  userProfile: Partial<UserProfile>;
}

interface Question {
  id: string;
  question: string;
  type: 'multiple' | 'single' | 'text';
  options?: Array<{
    value: string;
    label: string;
    domains?: string[];
    strategy?: 'deepen' | 'expand' | 'explore';
    content?: 'how-to' | 'analysis' | 'summaries';
  }>;
  explanation?: string;
}

const DiscoveryQuestions: Question[] = [
  {
    id: 'career_focus',
    question: "What's your primary career focus right now?",
    type: 'single',
    options: [
      { 
        value: 'tech_dev', 
        label: 'Software Development', 
        domains: ['technology'] 
      },
      { 
        value: 'business_lead', 
        label: 'Business Leadership', 
        domains: ['business', 'finance'] 
      },
      { 
        value: 'creative_work', 
        label: 'Creative Work', 
        domains: ['design', 'marketing'] 
      },
      { 
        value: 'research', 
        label: 'Research/Academia', 
        domains: ['science', 'education'] 
      }
    ],
    explanation: 'This helps me understand your professional domain for content curation.'
  },
  {
    id: 'growth_goal',
    question: "What type of growth are you seeking?",
    type: 'single',
    options: [
      { 
        value: 'skills', 
        label: 'New Skills', 
        strategy: 'expand' 
      },
      { 
        value: 'expertise', 
        label: 'Deeper Expertise', 
        strategy: 'deepen' 
      },
      { 
        value: 'trends', 
        label: 'Stay Current', 
        strategy: 'explore' 
      }
    ],
    explanation: 'I\'ll tailor content to help you expand, deepen, or explore your knowledge.'
  },
  {
    id: 'learning_style',
    question: "How do you prefer to learn?",
    type: 'multiple',
    options: [
      { 
        value: 'practical', 
        label: 'Practical tutorials', 
        content: 'how-to' 
      },
      { 
        value: 'theoretical', 
        label: 'Deep dive articles', 
        content: 'analysis' 
      },
      { 
        value: 'quick', 
        label: 'Quick summaries', 
        content: 'summaries' 
      }
    ],
    explanation: 'I\'ll find content that matches your preferred learning format.'
  },
  {
    id: 'time_commitment',
    question: "How much time can you dedicate to learning per week?",
    type: 'single',
    options: [
      { value: '1-2h', label: '1-2 hours (Light)' },
      { value: '3-5h', label: '3-5 hours (Moderate)' },
      { value: '6-10h', label: '6-10 hours (Dedicated)' },
      { value: '10h+', label: '10+ hours (Intensive)' }
    ],
    explanation: 'This helps me recommend appropriately sized content and learning paths.'
  },
  {
    id: 'content_frequency',
    question: "How often would you like curated content?",
    type: 'single',
    options: [
      { value: 'daily', label: 'Daily updates' },
      { value: 'weekly', label: 'Weekly digest' },
      { value: 'biweekly', label: 'Bi-weekly highlights' },
      { value: 'monthly', label: 'Monthly deep dive' }
    ],
    explanation: 'I\'ll adjust the frequency of your personalized news delivery.'
  }
];

const SmartQuestioningStep: React.FC<SmartQuestioningStepProps> = ({
  guideStep, 
  nextStep, 
  completeStep, 
  updateUserProfile,
  userProfile
}) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAnswer = async (questionId: string, answer: any) => {
    const question = DiscoveryQuestions.find(q => q.id === questionId);
    
    // Update answers
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
    
    // Show processing state
    setIsProcessing(true);
    guideStep('eating', `Great choice! Let me understand that...`);
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update user profile based on answer
    const profileUpdate: Partial<UserProfile> = {};
    
    switch (questionId) {
      case 'career_focus':
        const selectedOption = question?.options?.find(opt => opt.value === answer);
        profileUpdate.careerFocus = answer;
        if (selectedOption?.domains) {
          profileUpdate.contentTypes = selectedOption.domains;
        }
        guideStep('happy', `Perfect! I'll focus on ${selectedOption?.label} content for you.`);
        break;
        
      case 'growth_goal':
        const growthOption = question?.options?.find(opt => opt.value === answer);
        profileUpdate.growthGoal = growthOption?.strategy;
        guideStep('thinking', `I'll help you ${answer} your knowledge and skills.`);
        break;
        
      case 'learning_style':
        const learningOptions = Array.isArray(answer) ? answer : [answer];
        const contentTypes = learningOptions.map(style => {
          const option = question?.options?.find(opt => opt.value === style);
          return option?.content;
        }).filter(Boolean);
        
        profileUpdate.learningStyle = learningOptions.join(',');
        if (contentTypes.length > 0) {
          profileUpdate.contentTypes = [...(profileUpdate.contentTypes || []), ...(contentTypes.filter(Boolean) as string[])];
        }
        guideStep('happy', `I'll find ${learningOptions.join(' and ')} content for you!`);
        break;
        
      case 'time_commitment':
        profileUpdate.updateFrequency = answer;
        guideStep('thinking', `I'll adjust content depth for your ${answer} schedule.`);
        break;
        
      case 'content_frequency':
        profileUpdate.updateFrequency = answer;
        guideStep('happy', `You'll get curated content ${answer}!`);
        break;
    }
    
    updateUserProfile(profileUpdate);
    setIsProcessing(false);
    
    // Move to next question or complete
    if (currentQuestion < DiscoveryQuestions.length - 1) {
      setTimeout(() => {
        setCurrentQuestion(prev => prev + 1);
        guideStep('thinking', 'Let me ask you something else...');
      }, 1500);
    } else {
      // Complete questioning
      setTimeout(() => {
        completeQuestioning();
      }, 1500);
    }
  };

  const completeQuestioning = () => {
    completeStep('smart-questioning');
    
    // Generate personalized message
    const { careerFocus, growthGoal, learningStyle } = answers;
    const growthMessage = {
      skills: 'expand into new areas',
      expertise: 'deepen your existing knowledge',
      trends: 'explore emerging trends'
    };
    
    guideStep('happy', `Perfect! I now understand how to help you ${growthMessage[growthGoal as keyof typeof growthMessage]} in ${careerFocus}. Let's set up your news sources!`);
    
    nextStep();
  };

  const skipQuestioning = () => {
    guideStep('neutral', 'No problem! We can set this up with default preferences.');
    completeQuestioning();
  };

  const goBack = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
      guideStep('thinking', 'Let me revisit that question...');
    }
  };

  const question = DiscoveryQuestions[currentQuestion];
  const progress = ((currentQuestion + 1) / DiscoveryQuestions.length) * 100;

  return (
    <div className="smart-questioning-step">
      <div className="questioning-content">
        {/* Progress Bar */}
        <div className="question-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="progress-text">
            Question {currentQuestion + 1} of {DiscoveryQuestions.length}
          </div>
        </div>

        {/* Current Question */}
        <div className="question-container">
          <h2>{question.question}</h2>
          
          {question.explanation && (
            <p className="question-explanation">{question.explanation}</p>
          )}

          <div className="question-options">
            {question.type === 'single' && question.options?.map(option => (
              <button
                key={option.value}
                className={`option-btn ${answers[question.id] === option.value ? 'selected' : ''}`}
                onClick={() => handleAnswer(question.id, option.value)}
                disabled={isProcessing}
              >
                <span className="option-label">{option.label}</span>
              </button>
            ))}

            {question.type === 'multiple' && question.options?.map(option => (
              <label key={option.value} className="option-checkbox">
                <input
                  type="checkbox"
                  value={option.value}
                  checked={Array.isArray(answers[question.id]) && answers[question.id].includes(option.value)}
                  onChange={(e) => {
                    const current = Array.isArray(answers[question.id]) ? answers[question.id] : [];
                    if (e.target.checked) {
                      handleAnswer(question.id, [...current, option.value]);
                    } else {
                      handleAnswer(question.id, current.filter((v: string) => v !== option.value));
                    }
                  }}
                  disabled={isProcessing}
                />
                <span className="option-label">{option.label}</span>
              </label>
            ))}

            {question.type === 'text' && (
              <textarea
                className="text-input"
                placeholder="Your answer..."
                onChange={(e) => handleAnswer(question.id, e.target.value)}
                disabled={isProcessing}
              />
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="question-navigation">
          {currentQuestion > 0 && (
            <button 
              className="nav-btn secondary"
              onClick={goBack}
              disabled={isProcessing}
            >
              Previous
            </button>
          )}
          
          <button 
            className="nav-btn tertiary"
            onClick={skipQuestioning}
            disabled={isProcessing}
          >
            Skip Questions
          </button>
        </div>

        {/* Current Profile Summary */}
        {Object.keys(answers).length > 0 && (
          <div className="profile-summary">
            <h3>Your Preferences So Far</h3>
            <div className="summary-grid">
              {Object.entries(answers).map(([key, value]) => {
                const q = DiscoveryQuestions.find(q => q.id === key);
                const displayValue = Array.isArray(value) ? value.join(', ') : value;
                const option = q?.options?.find(opt => opt.value === value);
                
                return (
                  <div key={key} className="summary-item">
                    <strong>{q?.question}:</strong>
                    <span>{option?.label || displayValue}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export { SmartQuestioningStep };
