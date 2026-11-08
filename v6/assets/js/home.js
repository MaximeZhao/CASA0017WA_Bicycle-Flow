'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const guestKey = 'mind-the-dock:guest:v5';
  const entryParams = new URLSearchParams(location.search);
  const forceLogin = entryParams.get('auth') === 'login';
  let user = null;
  let registering = false;
  let busy = false;
  let briefingLoaded = false;
  let sessionCheck = 0;
  let guest = false;
  try { guest = sessionStorage.getItem(guestKey) === 'true'; } catch { /* The page still works without storage. */ }
  const fields = [
    { input: $('authEmail'), error: $('emailError'), message: 'Please enter a valid email address.' },
    { input: $('authUsername'), error: $('usernameError'), message: 'Choose a username with 2–40 characters.' },
    { input: $('authPassword'), error: $('passwordError'), message: 'Use a password with 8–128 characters.' },
    { input: $('authConfirm'), error: $('confirmError'), message: 'Your passwords do not match.' },
  ];

  function clearErrors() {
    $('authStatus').textContent = '';
    fields.forEach(({ input, error }) => { input.removeAttribute('aria-invalid'); error.textContent = ''; });
  }
  function setMode(register) {
    if (busy) return;
    registering = register;
    clearErrors();
    $('loginTab').classList.toggle('is-active', !register);
    $('registerTab').classList.toggle('is-active', register);
    $('loginTab').setAttribute('aria-pressed', String(!register));
    $('registerTab').setAttribute('aria-pressed', String(register));
    $('usernameField').hidden = $('confirmField').hidden = !register;
    $('authUsername').disabled = $('authConfirm').disabled = !register;
    $('authUsername').required = $('authConfirm').required = register;
    $('authPassword').autocomplete = register ? 'new-password' : 'current-password';
    $('authSubmit').textContent = register ? 'Create account →' : 'Log in →';
    $('authIntro').textContent = register ? 'Create your account and start exploring London.' : 'Log in to your account, or explore as a guest.';
  }
  function setBusy(value) {
    busy = value;
    ['authSubmit', 'continueGuest', 'loginTab', 'registerTab'].forEach(id => { $(id).disabled = value; });
    $('authForm').setAttribute('aria-busy', String(value));
    $('authSubmit').textContent = value ? 'Please wait…' : registering ? 'Create account →' : 'Log in →';
  }
  function showHome(focus = true) {
    $('welcomeScreen').hidden = true;
    $('homeContent').hidden = false;
    document.body.classList.remove('is-welcoming');
    $('welcomeUser').textContent = user ? 'Welcome back, ' + user.username : 'Welcome, guest. Let’s find your next ride.';
    $('accountAction').textContent = user ? 'Log out' : 'Log in / Register';
    if (focus) $('homeMain').focus({ preventScroll: true });
    if (!briefingLoaded) loadBriefing();
  }
  function showWelcome() {
    $('homeContent').hidden = true;
    $('welcomeScreen').hidden = false;
    document.body.classList.add('is-welcoming');
    window.scrollTo(0, 0);
    clearErrors();
  }
  function rememberGuest(value) {
    guest = value;
    try { if (value) sessionStorage.setItem(guestKey, 'true'); else sessionStorage.removeItem(guestKey); } catch { /* Guest access is still available. */ }
  }
  async function authRequest(action, body) {
    const response = await fetch('/api/auth/' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Unable to continue. Please try again.');
    return data;
  }
  $('loginTab').addEventListener('click', () => setMode(false));
  $('registerTab').addEventListener('click', () => setMode(true));
  fields.forEach(({ input, error }) => input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); error.textContent = ''; $('authStatus').textContent = ''; }));
  $('authForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    clearErrors();
    let firstInvalid;
    fields.forEach(({ input, error, message }) => {
      if (input.disabled) return;
      let valid = input.checkValidity();
      if (input === $('authPassword')) valid = input.value.length >= 8 && input.value.length <= 128;
      if (input === $('authUsername')) valid = /^[\p{L}\p{N} ._'’-]{2,40}$/u.test(input.value.trim());
      if (input === $('authConfirm')) valid = valid && input.value === $('authPassword').value;
      if (!valid) { input.setAttribute('aria-invalid', 'true'); error.textContent = message; firstInvalid ||= input; }
    });
    if (firstInvalid) { firstInvalid.focus(); return; }
    ++sessionCheck; // An earlier session probe must not override a newly completed form.
    setBusy(true);
    try {
      const data = await authRequest(registering ? 'register' : 'login', {
        email: $('authEmail').value.trim(), username: $('authUsername').value.trim(),
        password: $('authPassword').value, confirmPassword: $('authConfirm').value,
      });
      user = data.user;
      BikeAccount.setUser(user);
      rememberGuest(false);
      $('authForm').reset();
      if (entryParams.get('returnTo') === 'profile') { location.assign(BikeSite.url('profile', BikeSite.read())); return; }
      showHome();
    } catch (error) { $('authStatus').textContent = error.message || 'Unable to connect. Please try again.'; }
    finally { setBusy(false); }
  });
  $('continueGuest').addEventListener('click', () => { ++sessionCheck; rememberGuest(true); showHome(); });
  $('accountAction').addEventListener('click', async () => {
    ++sessionCheck;
    if (user) {
      $('accountAction').disabled = true;
      try {
        await authRequest('logout', {});
        user = null;
        BikeAccount.setUser(null);
        rememberGuest(false);
        showWelcome();
        $('authEmail').focus();
      } catch { $('welcomeUser').textContent = 'Could not log out. Check your connection and try again.'; }
      finally { $('accountAction').disabled = false; }
    } else {
      rememberGuest(false);
      showWelcome();
      $('authEmail').focus();
    }
  });

  const today = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' });
  $('todayDate').textContent = today.format(new Date());
  $('todayDate').dateTime = BikeTimeline.dayOf(new Date().toISOString());
  async function loadBriefing() {
    briefingLoaded = true;
    $('briefingRetry').hidden = true;
    try {
      // Do not restore a historical navigation date into today's overview.
      const data = await BikeDataService.loadDashboardData();
      const timestamp = data.meta.observationTimestamps.at(-1);
      if (!timestamp) throw Error('No observations are available yet.');
      let bikes = 0, docks = 0, bikeReports = 0, dockReports = 0, reporting = 0;
      for (const station of data.stations) {
        const snapshot = BikeTimeline.freshSnapshot(station.history, timestamp, data.meta.staleAfterSeconds);
        if (BikeContract.status(snapshot, 'borrow', timestamp, data.meta.staleAfterSeconds) !== 'unknown') reporting++;
        if (snapshot?.isOperational !== true) continue;
        if (snapshot.bikes !== null) { bikes += snapshot.bikes; bikeReports++; }
        if (snapshot.docks !== null) { docks += snapshot.docks; dockReports++; }
      }
      const number = value => value.toLocaleString('en-GB');
      $('briefBikes').textContent = bikeReports ? number(bikes) : '—';
      $('briefDocks').textContent = dockReports ? number(docks) : '—';
      $('briefStations').textContent = number(reporting) + ' / ' + number(data.stations.length);
      const isToday = BikeTimeline.dayOf(timestamp) === BikeTimeline.dayOf(new Date().toISOString());
      const source = data.meta.dataKind || data.meta.availabilityKind || '';
      const simulated = data.meta.isSimulated === true || data.meta.includesSimulated === true || /simulat/i.test(source + ' ' + data.meta.source) || data.meta.mode === 'demo';
      $('briefingBadge').textContent = simulated ? 'Recorded · includes simulated data' : 'Recorded snapshot';
      $('briefingTime').textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)) + ' · London';
      $('briefingNote').textContent = (isToday ? 'Latest available observation today. ' : 'No observations for today. Showing the latest available record. ') + 'Check station-level availability on the map; these figures are not a live feed.';
    } catch (error) {
      $('briefingBadge').textContent = 'Snapshot unavailable';
      $('briefingNote').textContent = 'The network brief could not load. You can still explore the map, Daily Flow and our team.';
      $('briefingRetry').hidden = false;
    }
  }
  $('briefingRetry').addEventListener('click', loadBriefing);
  if (guest && !forceLogin) showHome(false); else showWelcome();
  const check = ++sessionCheck;
  BikeAccount.ready.then(next => {
    if (check !== sessionCheck) return;
    user = next;
    if (user || guest && !forceLogin) showHome(false);
  }).catch(() => { /* Keep guest and login choices available during a connection failure. */ });
})();
