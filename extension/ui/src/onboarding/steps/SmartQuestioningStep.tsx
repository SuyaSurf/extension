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

interface Option {
  value: string;
  label: string;
  hint?: string;
  icon?: string;
  domains?: string[];
  strategy?: 'deepen' | 'expand' | 'explore';
  content?: 'how-to' | 'analysis' | 'summaries';
}

interface Question {
  id: string;
  question: string;
  type: 'multiple' | 'single';
  explanation: string;
  options: Option[];
}

const QUESTIONS: Question[] = [
  {
    id: 'career_focus',
    question: "What's your primary career focus?",
    explanation: "Shapes the domain of content I curate for you.",
    type: 'single',
    options: [
      { value: 'tech_dev',      label: 'Software Development',  icon: '💻', domains: ['technology'] },
      { value: 'business_lead', label: 'Business & Leadership', icon: '📊', domains: ['business', 'finance'] },
      { value: 'creative_work', label: 'Creative & Design',     icon: '🎨', domains: ['design', 'marketing'] },
      { value: 'research',      label: 'Research / Academia',   icon: '🔬', domains: ['science', 'education'] },
    ],
  },
  {
    id: 'growth_goal',
    question: "What type of growth are you seeking?",
    explanation: "I'll tune content depth and breadth to match your goal.",
    type: 'single',
    options: [
      { value: 'skills',    label: 'New Skills',      icon: '🌱', hint: 'Expand into adjacent areas',      strategy: 'expand'  },
      { value: 'expertise', label: 'Deeper Expertise', icon: '🎯', hint: 'Master your core domain',         strategy: 'deepen'  },
      { value: 'trends',    label: 'Stay Current',     icon: '📡', hint: 'Follow emerging developments',    strategy: 'explore' },
    ],
  },
  {
    id: 'learning_style',
    question: "How do you prefer to learn?",
    explanation: "I'll source content in the formats you actually enjoy.",
    type: 'multiple',
    options: [
      { value: 'practical',    label: 'Practical tutorials', icon: '🛠️', content: 'how-to'   },
      { value: 'theoretical',  label: 'Deep-dive analysis',  icon: '📖', content: 'analysis'  },
      { value: 'quick',        label: 'Quick summaries',     icon: '⚡', content: 'summaries' },
    ],
  },
  {
    id: 'time_commitment',
    question: "How much learning time per week?",
    explanation: "Helps me size content and learning paths appropriately.",
    type: 'single',
    options: [
      { value: '1-2h',  label: '1–2 hrs',  hint: 'Light',      icon: '🕐' },
      { value: '3-5h',  label: '3–5 hrs',  hint: 'Moderate',   icon: '🕓' },
      { value: '6-10h', label: '6–10 hrs', hint: 'Dedicated',  icon: '🕖' },
      { value: '10h+',  label: '10+ hrs',  hint: 'Intensive',  icon: '🕙' },
    ],
  },
  {
    id: 'content_frequency',
    question: "How often would you like curated content?",
    explanation: "I'll adjust delivery timing to fit your rhythm.",
    type: 'single',
    options: [
      { value: 'daily',     label: 'Daily',      hint: 'Fresh picks every morning', icon: '☀️' },
      { value: 'weekly',    label: 'Weekly',      hint: 'A rich digest on Mondays',  icon: '📅' },
      { value: 'biweekly',  label: 'Bi-weekly',   hint: 'Highlights twice a month',  icon: '🗓️' },
      { value: 'monthly',   label: 'Monthly',     hint: 'Deep-dive once a month',    icon: '🌕' },
    ],
  },
];

const SmartQuestioningStep: React.FC<SmartQuestioningStepProps> = ({
  guideStep, nextStep, completeStep, updateUserProfile, userProfile,
}) => {
  const [currentIdx, setCurrentIdx]     = useState(0);
  const [answers, setAnswers]           = useState<Record<string, any>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const question = QUESTIONS[currentIdx];
  const progress = ((currentIdx + 1) / QUESTIONS.length) * 100;

  const handleSingle = async (qId: string, value: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setAnswers(prev => ({ ...prev, [qId]: value }));
    guideStep('eating', 'Got it, processing your answer…');

    await new Promise(r => setTimeout(r, 900));

    const q = QUESTIONS.find(q => q.id === qId);
    const opt = q?.options.find(o => o.value === value);
    const update: Partial<UserProfile> = {};

    if (qId === 'career_focus') {
      update.careerFocus = value;
      if (opt?.domains) update.contentTypes = opt.domains;
      guideStep('happy', `${opt?.label} — great choice! I'll focus on that domain.`);
    } else if (qId === 'growth_goal') {
      update.growthGoal = opt?.strategy;
      guideStep('thinking', `I'll help you ${value} your knowledge and skills.`);
    } else if (qId === 'time_commitment') {
      update.updateFrequency = value;
      guideStep('thinking', `I'll match content depth to your ${value} schedule.`);
    } else if (qId === 'content_frequency') {
      update.updateFrequency = value;
      guideStep('happy', `You'll get curated content ${value}!`);
    }

    updateUserProfile(update);
    advance();
  };

  const handleMultiToggle = (qId: string, value: string) => {
    const current: string[] = Array.isArray(answers[qId]) ? answers[qId] : [];
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    setAnswers(prev => ({ ...prev, [qId]: next }));
  };

  const confirmMulti = async () => {
    if (isProcessing) return;
    const values: string[] = Array.isArray(answers[question.id]) ? answers[question.id] : [];
    if (values.length === 0) return;
    setIsProcessing(true);

    const q = QUESTIONS[currentIdx];
    const contentTypes = values.map(v => q.options.find(o => o.value === v)?.content).filter(Boolean) as string[];
    updateUserProfile({ learningStyle: values.join(','), contentTypes });
    guideStep('happy', `I'll find ${values.join(' and ')} content for you!`);

    await new Promise(r => setTimeout(r, 900));
    advance();
  };

  const advance = () => {
    setIsProcessing(false);
    if (currentIdx < QUESTIONS.length - 1) {
      setTimeout(() => {
        setCurrentIdx(i => i + 1);
        guideStep('thinking', 'Let me ask you something else…');
      }, 600);
    } else {
      setTimeout(finish, 800);
    }
  };

  const finish = () => {
    completeStep('smart-questioning');
    const goal = answers.growth_goal;
    const focus = answers.career_focus;
    const messages: Record<string, string> = {
      skills: 'expand into new areas', expertise: 'deepen your existing knowledge', trends: 'explore emerging trends',
    };
    guideStep('happy', `Perfect! I'll help you ${messages[goal] ?? 'grow'} in ${focus ?? 'your field'}. Let's set up your news sources!`);
    nextStep();
  };

  const skip = () => {
    guideStep('neutral', 'No problem — default preferences applied.');
    finish();
  };

  const isSelected = (value: string) =>
    question.type === 'single'
      ? answers[question.id] === value
      : Array.isArray(answers[question.id]) && answers[question.id].includes(value);

  const multiHasAnswer = Array.isArray(answers[question.id]) && answers[question.id].length > 0;

  return (
    <div className="sq-root ob-step-root">
      {/* Progress */}
      <div className="sq-progress">
        <div className="ob-progress-track">
          <div className="ob-progress-fill" style={{ width: `${progress}%` }}/>
        </div>
        <div className="sq-progress__label">
          <span className="sq-progress__num">{currentIdx + 1} / {QUESTIONS.length}</span>
          <button className="ob-btn ob-btn--ghost" onClick={skip} disabled={isProcessing}>
            Skip all
          </button>
        </div>
      </div>

      {/* Question */}
      <div className="sq-question ob-stagger" key={question.id}>
        <span className="ob-step-label">✦ {question.type === 'multiple' ? 'Select all that apply' : 'Choose one'}</span>
        <h2 className="ob-step-title">{question.question}</h2>
        <p className="ob-step-sub">{question.explanation}</p>

        <div className={`sq-options ${question.type === 'multiple' ? 'sq-options--multi' : ''}`}>
          {question.options.map(opt => (
            <button
              key={opt.value}
              className={`sq-option ${isSelected(opt.value) ? 'sq-option--selected' : ''} ${isProcessing ? 'sq-option--loading' : ''}`}
              onClick={() => question.type === 'single'
                ? handleSingle(question.id, opt.value)
                : handleMultiToggle(question.id, opt.value)
              }
              disabled={isProcessing && question.type === 'single'}
            >
              {opt.icon && <span className="sq-option__icon">{opt.icon}</span>}
              <div className="sq-option__body">
                <span className="sq-option__label">{opt.label}</span>
                {opt.hint && <span className="sq-option__hint">{opt.hint}</span>}
              </div>
              {question.type === 'multiple' && (
                <span className={`sq-checkbox ${isSelected(opt.value) ? 'sq-checkbox--on' : ''}`}>
                  {isSelected(opt.value) ? '✓' : ''}
                </span>
              )}
              {question.type === 'single' && isSelected(opt.value) && (
                <span className="sq-option__dot"/>
              )}
            </button>
          ))}
        </div>

        {question.type === 'multiple' && (
          <button
            className="ob-btn ob-btn--primary"
            onClick={confirmMulti}
            disabled={!multiHasAnswer || isProcessing}
          >
            {isProcessing ? 'Saving…' : 'Confirm →'}
          </button>
        )}
      </div>

      {/* Answers so far */}
      {Object.keys(answers).length > 0 && (
        <div className="sq-summary">
          <p className="sq-summary__label">Your answers so far</p>
          <div className="sq-summary__pills">
            {Object.entries(answers).map(([qId, val]) => {
              const q = QUESTIONS.find(q => q.id === qId);
              const displayVal = Array.isArray(val) ? val.join(', ') : val;
              const opt = q?.options.find(o => o.value === val);
              return (
                <span key={qId} className="sq-summary__pill">
                  <span className="sq-summary__pill-key">{q?.id.replace(/_/g, ' ')}</span>
                  {opt?.label ?? displayVal}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Back nav */}
      {currentIdx > 0 && (
        <button className="ob-btn ob-btn--ghost" onClick={() => { setCurrentIdx(i => i - 1); guideStep('thinking', 'Let me revisit that…'); }}>
          ← Previous question
        </button>
      )}

      <style>{`
        .sq-root { max-width: 640px; }

        .sq-progress { display: flex; flex-direction: column; gap: 8px; }
        .sq-progress__label {
          display: flex; align-items: center; justify-content: space-between;
        }
        .sq-progress__num {
          font-family: var(--font-display); font-size: 11px; font-weight: 700;
          letter-spacing: .08em; color: var(--text-muted); text-transform: uppercase;
        }

        .sq-question { display: flex; flex-direction: column; gap: 16px; }

        .sq-options {
          display: flex; flex-direction: column; gap: 6px;
        }
        .sq-options--multi { gap: 8px; }

        .sq-option {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          cursor: pointer; text-align: left;
          transition: background .18s, border-color .18s, transform .15s;
          position: relative;
        }
        .sq-option:hover:not(:disabled) {
          background: var(--bg-card-hover);
          border-color: var(--border-hover);
          transform: translateX(3px);
        }
        .sq-option--selected {
          border-color: var(--border-accent) !important;
          background: rgba(255,107,53,.06) !important;
        }
        .sq-option--loading { pointer-events: none; opacity: .6; }

        .sq-option__icon { font-size: 20px; flex-shrink: 0; }
        .sq-option__body { display: flex; flex-direction: column; gap: 2px; flex: 1; }
        .sq-option__label {
          font-family: var(--font-display); font-size: 14px; font-weight: 700;
          color: var(--text-primary);
        }
        .sq-option--selected .sq-option__label { color: var(--accent-text); }
        .sq-option__hint {
          font-family: var(--font-body); font-size: 11px; color: var(--text-muted);
        }
        .sq-option__dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--accent); flex-shrink: 0;
          box-shadow: 0 0 8px var(--accent);
        }

        .sq-checkbox {
          width: 20px; height: 20px; border-radius: 5px;
          border: 1.5px solid var(--border);
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; color: var(--accent-text);
          flex-shrink: 0; transition: all .15s;
        }
        .sq-checkbox--on {
          background: rgba(255,107,53,.18);
          border-color: var(--border-accent);
        }

        .sq-summary {
          padding: 14px 16px;
          background: rgba(255,255,255,.025);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          display: flex; flex-direction: column; gap: 10px;
        }
        .sq-summary__label {
          font-family: var(--font-display); font-size: 10px; font-weight: 700;
          letter-spacing: .08em; text-transform: uppercase; color: var(--text-muted);
        }
        .sq-summary__pills { display: flex; flex-wrap: wrap; gap: 6px; }
        .sq-summary__pill {
          display: flex; align-items: center; gap: 6px;
          padding: 4px 10px; border-radius: 20px;
          background: rgba(255,255,255,.05);
          border: 1px solid var(--border);
          font-family: var(--font-body); font-size: 11px; color: var(--text-secondary);
        }
        .sq-summary__pill-key {
          font-size: 10px; color: var(--text-muted); text-transform: capitalize;
        }
        .sq-summary__pill-key::after { content: ': '; }
      `}</style>
    </div>
  );
};

export { SmartQuestioningStep };
