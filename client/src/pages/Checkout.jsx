import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

const INITIAL_CARD = { name: '', number: '', expMonth: '', expYear: '', cvv: '' };

export default function Checkout() {
  const { plan: planCode } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [invalidPlan, setInvalidPlan] = useState(false);
  const [card, setCard] = useState(INITIAL_CARD);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/plans')
      .then((plans) => {
        const selected = plans.find((candidate) => candidate.code === planCode);
        if (selected) setPlan(selected);
        else setInvalidPlan(true);
      })
      .catch((requestError) => setError(requestError.message));
  }, [planCode]);

  const set = (key) => (event) => setCard({ ...card, [key]: event.target.value });
  const submit = async (event) => {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      await api('/subscription', {
        method: 'POST',
        body: { planCode, card: { ...card, expMonth: Number(card.expMonth), expYear: Number(card.expYear) } },
      });
      navigate('/account', { state: { welcome: `Welcome to ${plan.name}! Your subscription is active.` } });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  if (invalidPlan) return <Navigate to="/plans" replace />;

  return (
    <main className="page narrow checkout-page">
      <h1>{plan ? `Subscribe to ${plan.name}` : 'Checkout'}</h1>
      {plan && <p className="muted">{plan.quality} · {plan.screens} {plan.screens === 1 ? 'screen' : 'screens'} · ${(plan.price_cents / 100).toFixed(2)} / month</p>}
      <form className="card form" onSubmit={submit}>
        <label>Name on card<input autoComplete="cc-name" required value={card.name} onChange={set('name')} /></label>
        <label>Card number<input inputMode="numeric" autoComplete="cc-number" required value={card.number} onChange={set('number')} placeholder="4242 4242 4242 4242" /></label>
        <div className="checkout-fields">
          <label>Month<input type="number" min="1" max="12" autoComplete="cc-exp-month" required value={card.expMonth} onChange={set('expMonth')} /></label>
          <label>Year<input type="number" min="2026" autoComplete="cc-exp-year" required value={card.expYear} onChange={set('expYear')} /></label>
          <label>CVV<input inputMode="numeric" autoComplete="cc-csc" minLength="3" maxLength="4" required value={card.cvv} onChange={set('cvv')} /></label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={!plan || busy}>{busy ? 'Processing...' : plan ? `Pay $${(plan.price_cents / 100).toFixed(2)}` : 'Loading plan...'}</button>
        <small className="muted">Test success: 4242 4242 4242 4242 or 5555 5555 5555 4444. Test decline: 4000 0000 0000 0002.</small>
      </form>
    </main>
  );
}
