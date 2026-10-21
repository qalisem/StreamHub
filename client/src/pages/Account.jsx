import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Account() {
  const { user, updateUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => setDisplayName(user?.displayName || ''), [user?.displayName]);

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
