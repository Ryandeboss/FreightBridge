import { Code2, TerminalSquare, TextQuote } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export type LabWorkstationTab = 'console' | 'code' | 'answer';

type LabWorkstationProps = {
  title: string;
  subtitle: string;
  caseLabel: string;
  statusLabel: string;
  console: ReactNode;
  code: ReactNode;
  answer: ReactNode;
  defaultTab?: LabWorkstationTab;
};

const tabs: Array<{ id: LabWorkstationTab; label: string; icon: typeof TerminalSquare }> = [
  { id: 'console', label: 'Console', icon: TerminalSquare },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'answer', label: 'Answer', icon: TextQuote },
];

export function LabWorkstation({
  title,
  subtitle,
  caseLabel,
  statusLabel,
  console,
  code,
  answer,
  defaultTab = 'console',
}: LabWorkstationProps) {
  const [activeTab, setActiveTab] = useState<LabWorkstationTab>(defaultTab);

  return (
    <section className="lab-workstation" data-testid="lab-workstation">
      <header className="lab-workstation-header">
        <div>
          <span>{caseLabel}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <span className="lab-workstation-status">{statusLabel}</span>
      </header>

      <nav className="lab-workstation-tabs" role="tablist" aria-label="Lab workstation views">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={activeTab === tab.id ? 'active' : ''}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={'lab-workstation-' + tab.id}
              id={'lab-workstation-tab-' + tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div
        id={'lab-workstation-' + activeTab}
        className="lab-workstation-panel"
        role="tabpanel"
        aria-labelledby={'lab-workstation-tab-' + activeTab}
      >
        {activeTab === 'console' && console}
        {activeTab === 'code' && code}
        {activeTab === 'answer' && answer}
      </div>
    </section>
  );
}
