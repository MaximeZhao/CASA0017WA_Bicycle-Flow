'use strict';
(() => {
  let current = null, revision = 0;
  function initials(name) { return name.trim().split(/\s+/).slice(0, 2).map(s => [...s][0]).join('').toUpperCase(); }
  function setUser(user) {
    ++revision;
    current = user;
    document.querySelectorAll('[data-account-name]').forEach(el => { el.textContent = user?.username || 'Guest'; });
    document.querySelectorAll('.account-link').forEach(link => {
      link.setAttribute('aria-label', user ? 'Hi, ' + user.username + '. Open your profile' : 'Hi, Guest. Open your profile');
      link.removeAttribute('aria-busy');
      if (location.pathname.endsWith('/profile.html')) link.setAttribute('aria-current', 'page');
    });
    document.querySelectorAll('[data-account-avatar]').forEach(el => {
      el.replaceChildren();
      const label = document.createElement('span');
      label.textContent = user ? initials(user.username) : 'G';
      el.append(label);
      if (user?.avatarUrl) {
        const image = document.createElement('img');
        image.alt = '';
        image.src = user.avatarUrl;
        image.addEventListener('load', () => { label.hidden = true; });
        image.addEventListener('error', () => { image.remove(); label.hidden = false; });
        el.append(image);
      }
    });
    window.dispatchEvent(new CustomEvent('account-changed', { detail: { user } }));
    return user;
  }
  async function refresh() {
    const before = revision;
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!response.ok) throw Error('Your account could not load. Please try again.');
    const data = await response.json();
    return before === revision ? setUser(data.user) : current;
  }
  const ready = refresh();
  ready.catch(() => { document.querySelectorAll('.account-link').forEach(el => el.removeAttribute('aria-busy')); });
  window.BikeAccount = { ready, refresh, setUser, read: () => current };
})();
