import { ArrowRight, Building2, Network, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { hasStartedLearningJourney } from '../training/journey';

const companies = [
  {
    id: 'apex',
    name: 'Apex Logistics',
    role: 'Freight request partner',
    description: 'Sends freight requests into the network.',
    icon: Building2,
  },
  {
    id: 'freightbridge',
    name: 'FreightBridge',
    role: 'Integration connector',
    description: 'Translates, routes, and verifies communication.',
    icon: Network,
  },
  {
    id: 'midwest',
    name: 'Midwest Carrier',
    role: 'Carrier',
    description: 'Accepts freight and sends shipment updates.',
    icon: Truck,
  },
] as const;

export function TrainingEntryPage() {
  const started = hasStartedLearningJourney();

  return (
    <main className="journey-entry-page" data-testid="journey-entry-page">
      <section className="journey-entry-shell">
        <header className="journey-entry-header">
          <p className="journey-wordmark">FreightBridge</p>
          <h1>Three companies. One connected shipping journey.</h1>
          <p>
            Learn how freight messages move between partners, how FreightBridge translates them,
            and how an integration developer finds and fixes problems when the systems disagree.
          </p>
        </header>

        <section className="journey-company-flow" aria-label="Apex to FreightBridge to Midwest">
          {companies.map((company, index) => {
            const Icon = company.icon;
            return (
              <div className="journey-company-slot" key={company.id}>
                <article className="journey-company-card" data-testid={`journey-company-${company.id}`}>
                  <span className="journey-company-icon"><Icon size={28} strokeWidth={1.7} /></span>
                  <span className="journey-company-role">{company.role}</span>
                  <h2>{company.name}</h2>
                  <p>{company.description}</p>
                </article>
                {index < companies.length - 1 && (
                  <div className="journey-connector" aria-hidden="true">
                    <span />
                    <ArrowRight size={20} />
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <div className="journey-entry-action">
          <Link
            className="journey-start-button"
            to={started ? '/access?next=/learn/desk' : '/access?next=/learn/orientation'}
          >
            {started ? 'Continue Training' : 'Begin Your Journey'}
            <ArrowRight size={18} />
          </Link>
          <small>{started ? 'Pick up where you left off.' : 'Start with a short introduction to the three companies.'}</small>
        </div>
      </section>
    </main>
  );
}
