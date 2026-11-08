'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let user = null, avatarDraft, saving = false, imageTask = 0;
  function showAvatar(src) {
    $('profileAvatar').hidden = !src;
    $('profileInitials').hidden = Boolean(src);
    if (src) $('profileAvatar').src = src;
    else $('profileAvatar').removeAttribute('src');
    $('removeAvatar').hidden = !src;
  }
  function populate(next) {
    user = next;
    $('profileUsername').value = user.username;
    $('profileFullName').value = user.fullName;
    $('profileEmail').value = user.email;
    $('profileLocation').value = user.location;
    $('profileBio').value = user.bio;
    $('bioCount').textContent = user.bio.length;
    $('profileDisplayName').textContent = user.username;
    $('profileEmailPreview').textContent = user.email;
    $('profileInitials').textContent = user.username.trim().split(/\s+/).slice(0, 2).map(s => [...s][0]).join('').toUpperCase();
    showAvatar(user.avatarUrl);
    avatarDraft = undefined;
  }
  function message(text, error = false) {
    $('profileStatus').textContent = text;
    $('profileStatus').classList.toggle('is-error', error);
  }
  $('profileBio').addEventListener('input', () => { $('bioCount').textContent = $('profileBio').value.length; });
  $('profileForm').addEventListener('input', () => message(''));
  $('profileAvatar').addEventListener('error', () => { $('profileAvatar').hidden = true; $('profileInitials').hidden = false; });
  $('avatarFile').addEventListener('change', async () => {
    const file = $('avatarFile').files[0];
    const task = ++imageTask;
    if (!file) return;
    $('photoFeedback').textContent = '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      $('photoFeedback').textContent = 'Choose a JPG, PNG or WebP image.'; return;
    }
    if (file.size > 5 * 1024 * 1024) { $('photoFeedback').textContent = 'Choose an image smaller than 5 MB.'; return; }
    $('saveProfile').disabled = true;
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (task !== imageTask) { bitmap.close(); return; }
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d');
      const size = Math.min(bitmap.width, bitmap.height);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 512, 512);
      bitmap.close();
      avatarDraft = canvas.toDataURL('image/jpeg', .86);
      showAvatar(avatarDraft);
      $('photoFeedback').textContent = 'Preview ready. Select Save changes to keep this photo.';
      message('');
    } catch { if (task === imageTask) $('photoFeedback').textContent = 'This image could not be read. Please choose another.'; }
    finally { if (task === imageTask) $('saveProfile').disabled = saving; $('avatarFile').value = ''; }
  });
  $('removeAvatar').addEventListener('click', () => {
    ++imageTask; avatarDraft = null; showAvatar(null);
    $('saveProfile').disabled = saving;
    $('photoFeedback').textContent = 'Select Save changes to remove your photo.';
  });
  $('profileForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !user) return;
    const username = $('profileUsername').value.trim();
    if (!/^[\p{L}\p{N} ._'’-]{2,40}$/u.test(username)) {
      message('Use 2–40 letters, numbers, spaces or simple punctuation for your username.', true);
      $('profileUsername').focus(); return;
    }
    const payload = { username, fullName: $('profileFullName').value, location: $('profileLocation').value, bio: $('profileBio').value };
    if (avatarDraft !== undefined) payload.avatarData = avatarDraft;
    saving = true;
    $('saveProfile').disabled = true; $('saveProfile').textContent = 'Saving…';
    $('avatarFile').disabled = $('removeAvatar').disabled = true;
    message('');
    try {
      const response = await fetch('/api/auth/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Your profile could not be saved. Please try again.');
      populate(result.user);
      BikeAccount.setUser(result.user);
      $('photoFeedback').textContent = '';
      message('Profile saved. Your changes are ready across the site.');
    } catch (error) { message(error.message || 'Unable to connect. Your changes have not been saved.', true); }
    finally {
      saving = false; $('saveProfile').disabled = false; $('saveProfile').textContent = 'Save changes';
      $('avatarFile').disabled = $('removeAvatar').disabled = false;
    }
  });
  BikeAccount.ready.then(next => {
    $('profileLoading').hidden = true;
    if (!next) { $('guestProfile').hidden = false; return; }
    populate(next);
    $('profileContent').hidden = false;
  }).catch(error => { $('profileLoading').textContent = error.message + ' Refresh this page to retry.'; });
})();
