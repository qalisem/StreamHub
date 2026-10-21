import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

const ACCESS = {
  basic: 'Basic titles',
  standard: 'Basic and Standard titles',
  premium: 'Every title in the catalog',
};

function PlanAction({ plan, user, subscription }) {
  if (!user) return <Link className="btn plan-action" to="/register">Sign up to choose</Link>;
  if (!subscription) return <Link className="btn plan-action" to={`/checkout/${plan.code}`}>Choose {plan.name}</Link>;
  if (subscription.status === 'active' && subscription.plan.code === plan.code) {
    return <span className="plan-current" aria-label={`${plan.name} is your current plan`}>Your plan</span>;
  }
  return <Link className="btn ghost plan-action" to="/account">Change on Account page</Link>;
}

export default function Plans() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/plans')
      .then(setPlans)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!user) return setSubscription(null);
    api('/subscription')
      .then((data) => setSubscription(data.subscription))
      .catch(() => setSubscription(null));
  }, [user]);

  return (
    <main className="page plans-page">
      <h1>Choose your plan</h1>
      <p className="muted">Cancel anytime. Upgrades apply right away, downgrades at the end of your billing cycle.</p>
      {error && <p className="error">{error}</p>}
      <div className="plans-grid">
        {plans.map((plan) => (
          <section key={plan.code} className={`card plan-card ${plan.code === 'standard' ? 'featured' : ''}`}>
            {plan.code === 'standard' && <span className="popular">Most popular</span>}
            <h2>{plan.name}</h2>
            <p className="plan-price">
              ${(plan.price_cents / 100).toFixed(2)}<small> / month</small>
            </p>
            <ul>
              <li>{plan.quality} video</li>
              <li>Watch on {plan.screens} {plan.screens === 1 ? 'screen' : 'screens'} at once</li>
              <li>{ACCESS[plan.code]}</li>
            </ul>
            <PlanAction plan={plan} user={user} subscription={subscription} />
          </section>
        ))}
      </div>
    </main>
  );
}
