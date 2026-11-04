import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

export default function Receipt() {
  const { id } = useParams();
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/payments/${id}`).then(setReceipt).catch((requestError) => setError(requestError.message));
  }, [id]);

  if (error) return <main className="page narrow"><p className="error">{error}</p><Link to="/account">Back to Account</Link></main>;
  if (!receipt) return <main className="page narrow"><p className="muted">Loading receipt...</p></main>;

  return (
    <main className="page narrow receipt-page">
      <Link to="/account" className="muted no-print">← Back to Account</Link>
      <section className="card receipt-card">
        <h1>StreamHub receipt</h1>
        <p className="muted">{receipt.receiptNumber}</p>
        <dl>
          <dt>Date</dt><dd>{new Date(receipt.createdAt).toLocaleString()}</dd>
          <dt>Description</dt><dd>{receipt.description}</dd>
          <dt>Plan</dt><dd>{receipt.planName}</dd>
          <dt>Payment</dt><dd className={receipt.status === 'succeeded' ? 'success' : 'danger'}>{receipt.status}</dd>
          <dt>Card</dt><dd>Ending {receipt.cardLast4}</dd>
          <dt>Total</dt><dd><strong>${(receipt.amountCents / 100).toFixed(2)}</strong></dd>
        </dl>
      </section>
      <button className="btn no-print" onClick={() => window.print()}>Print receipt</button>
    </main>
  );
}
