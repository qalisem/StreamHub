import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Account() {
  const { user, updateUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [welcomeMessage, setWelcomeMessage] = useState(location.state?.welcome || '');
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [retryCard, setRetryCard] = useState({ name: '', number: '', expMonth: '', expYear: '', cvv: '' });
  const [subscriptionError, setSubscriptionError] = useState('');
  const [subscriptionMessage, setSubscriptionMessage] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => setDisplayName(user?.displayName || ''), [user?.displayName]);
  useEffect(() => {
    if (location.state?.welcome) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state?.welcome, navigate]);
  useEffect(() => {
    Promise.all([api('/subscription'), api('/plans'), api('/payments')])
      .then(([subscriptionData, planData, paymentData]) => {
        setSubscription(subscriptionData.subscription);
        setPlans(planData);
        setPayments(paymentData);
      })
      .catch((error) => setSubscriptionError(error.message));
  }, []);

  const changePlan = async (planCode) => {
    setSubscriptionError(''); setSubscriptionMessage(''); setWelcomeMessage(''); setBusy('subscription');
    try {
      const data = await api('/subscription/change', { method: 'POST', body: { planCode } });
      setSubscription(data.subscription);
      const charge = data.chargedCents == null ? '' : ` Charged $${(data.chargedCents / 100).toFixed(2)}.`;
      setSubscriptionMessage(`${data.message}.${charge}`);
    } catch (error) {
      setSubscriptionError(error.message);
    } finally {
      setBusy('');
    }
  };

  const cancelSubscription = async () => {
    if (!window.confirm('Cancel your subscription at the end of this billing cycle?')) return;
    setSubscriptionError(''); setSubscriptionMessage(''); setWelcomeMessage(''); setBusy('subscription');
    try {
      const data = await api('/subscription/cancel', { method: 'POST' });
      setSubscription(data.subscription);
      setSubscriptionMessage(data.message);
    } catch (error) {
      setSubscriptionError(error.message);
    } finally {
      setBusy('');
    }
  };

  const retryPayment = async (event) => {
    event.preventDefault();
    setSubscriptionError(''); setSubscriptionMessage(''); setBusy('retry');
    try {
      const data = await api('/subscription/retry', {
        method: 'POST',
        body: { card: { ...retryCard, expMonth: Number(retryCard.expMonth), expYear: Number(retryCard.expYear) } },
      });
      setSubscription(data.subscription);
      setPayments(await api('/payments'));
      setRetryCard({ name: '', number: '', expMonth: '', expYear: '', cvv: '' });
      setSubscriptionMessage('Payment succeeded. Your subscription is active again.');
    } catch (error) {
      setSubscriptionError(error.message);
      setPayments(await api('/payments').catch(() => payments));
    } finally {
      setBusy('');
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileError(''); setProfileMessage(''); setBusy('profile');
    try {
      const data = await api('/auth/me', { method: 'PUT', body: { displayName } });
      updateUser(data.user);
      setProfileMessage('Profile updated.');
    } catch (error) {
      setProfileError(error.message);
    } finally {
      setBusy('');
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordError(''); setPasswordMessage(''); setBusy('password');
    try {
      const data = await api('/auth/password', { method: 'PUT', body: passwords });
      setPasswords({ currentPassword: '', newPassword: '' });
      setPasswordMessage(data.message);
    } catch (error) {
      setPasswordError(error.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <main className="page account-page">
      <h1>Account</h1>
      {(subscriptionMessage || welcomeMessage) && <p className="welcome" role="status">{subscriptionMessage || welcomeMessage}</p>}
      {subscriptionError && <p className="error" role="alert">{subscriptionError}</p>}
      {subscription?.status === 'past_due' && <p className="past-due-banner" role="alert">Your renewal payment failed. Update your card to restore playback.</p>}
      <section className="card subscription-card">
        <h2>Subscription</h2>
        {subscription ? (
          <>
            <h3>{subscription.plan.name} <span className={`status-badge status-badge--${subscription.status}`}>{subscription.status}</span></h3>
            <p className="muted">${(subscription.plan.price_cents / 100).toFixed(2)}/month · {subscription.plan.quality} · card ending {subscription.cardLast4}</p>
            <p>{subscription.status === 'cancelled' ? 'Access ends' : 'Next billing date'}: <strong>{new Date(subscription.periodEnd).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</strong></p>
            {subscription.status === 'past_due' && (
              <form className="form retry-form" onSubmit={retryPayment}>
                <h4>Update payment method</h4>
                <label>Name on card<input required value={retryCard.name} onChange={(e) => setRetryCard({ ...retryCard, name: e.target.value })} /></label>
                <label>Card number<input required value={retryCard.number} onChange={(e) => setRetryCard({ ...retryCard, number: e.target.value })} /></label>
                <div className="checkout-fields">
                  <label>Month<input type="number" min="1" max="12" required value={retryCard.expMonth} onChange={(e) => setRetryCard({ ...retryCard, expMonth: e.target.value })} /></label>
                  <label>Year<input type="number" required value={retryCard.expYear} onChange={(e) => setRetryCard({ ...retryCard, expYear: e.target.value })} /></label>
                  <label>CVV<input inputMode="numeric" minLength="3" maxLength="4" required value={retryCard.cvv} onChange={(e) => setRetryCard({ ...retryCard, cvv: e.target.value })} /></label>
                </div>
                <button className="btn" disabled={busy === 'retry'}>{busy === 'retry' ? 'Retrying...' : 'Retry payment'}</button>
              </form>
            )}
            {subscription.pendingPlan && <p className="pending-plan">Switching to {subscription.pendingPlan.name} on {new Date(subscription.periodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>}
            {subscription.status === 'active' && (
              <>
                <h4>Change plan</h4>
                <div className="plan-buttons">
                  {plans.map((plan) => {
                    const current = plan.code === subscription.plan.code;
                    const direction = plan.rank > subscription.plan.rank ? 'Upgrade' : 'Downgrade';
                    return (
                      <button key={plan.code} className={`btn ${current ? 'ghost' : ''}`} disabled={busy === 'subscription' || current} onClick={() => changePlan(plan.code)}>
                        {current ? `Current plan · $${(plan.price_cents / 100).toFixed(2)}` : `${direction} to ${plan.name} · $${(plan.price_cents / 100).toFixed(2)}`}
                      </button>
                    );
                  })}
                </div>
                {subscription.pendingPlan && <button className="link" disabled={busy === 'subscription'} onClick={() => changePlan(subscription.plan.code)}>Undo pending change</button>}
                <button className="link danger cancel-link" disabled={busy === 'subscription'} onClick={cancelSubscription}>Cancel subscription</button>
              </>
            )}
          </>
        ) : <p className="muted">You do not have a plan yet. <Link to="/plans">See plans</Link>.</p>}
      </section>
      <section className="card billing-history">
        <h2>Billing history</h2>
        {payments.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th>Card</th><th /></tr></thead>
              <tbody>{payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{new Date(payment.createdAt).toLocaleDateString()}</td>
                  <td>{payment.description}</td>
                  <td>${(payment.amountCents / 100).toFixed(2)}</td>
                  <td className={payment.status === 'succeeded' ? 'success' : 'danger'}>{payment.status}</td>
                  <td>•••• {payment.cardLast4}</td>
                  <td><Link to={`/receipts/${payment.id}`}>Receipt</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted">No payments yet.</p>}
      </section>
      <div className="account-grid">
        <section className="card">
          <h2>Profile</h2>
          <form className="form" onSubmit={saveProfile}>
            <label>Email<input type="email" value={user.email} readOnly /></label>
            <label>Display name<input required maxLength="60" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
            {profileError && <p className="error" role="alert">{profileError}</p>}
            {profileMessage && <p className="success" role="status">{profileMessage}</p>}
            <button className="btn" disabled={busy === 'profile'}>{busy === 'profile' ? 'Saving...' : 'Save profile'}</button>
          </form>
        </section>

        <section className="card">
          <h2>Change password</h2>
          <form className="form" onSubmit={changePassword}>
            <label>Current password<input type="password" autoComplete="current-password" required value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} /></label>
            <label>New password<input type="password" autoComplete="new-password" minLength="8" required value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} />
              <small className="muted">At least 8 characters, with a letter and a number</small></label>
            {passwordError && <p className="error" role="alert">{passwordError}</p>}
            {passwordMessage && <p className="success" role="status">{passwordMessage}</p>}
            <button className="btn" disabled={busy === 'password'}>{busy === 'password' ? 'Changing...' : 'Change password'}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
