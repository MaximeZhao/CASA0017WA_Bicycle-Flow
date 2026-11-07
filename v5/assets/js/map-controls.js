'use strict';

// Keep map tools collapsed until requested, without resetting search or layer state.
const toolsToggle = document.getElementById('toolsToggle');
const mapTools = document.getElementById('mapTools');
const toolButtons = [...document.querySelectorAll('[data-tool-panel]')];
function setToolsOpen(open) {
  mapTools.hidden = !open;
  toolsToggle.setAttribute('aria-expanded', String(open));
  if (!open && mapTools.contains(document.activeElement)) toolsToggle.focus();
}
toolsToggle.addEventListener('click', () => setToolsOpen(mapTools.hidden));
document.getElementById('closeTools').addEventListener('click', () => setToolsOpen(false));
toolButtons.forEach(button => button.addEventListener('click', () => {
  const opening = button.getAttribute('aria-expanded') !== 'true';
  toolButtons.forEach(item => {
    const active = item === button && opening;
    item.setAttribute('aria-expanded', String(active));
    document.getElementById(item.dataset.toolPanel).hidden = !active;
  });
  if (opening && button.dataset.toolPanel === 'searchPanel') document.getElementById('placeSearch').focus();
}));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !mapTools.hidden) setToolsOpen(false);
});

// This non-modal bottom dock leaves map gestures and station controls available.
const timelineDialog = document.getElementById('timelineDialog');
const timelineToggle = document.getElementById('timelineToggle');
function setPlaybackOpen(open) {
  const restoreFocus = !open && timelineDialog.contains(document.activeElement);
  timelineDialog.hidden = !open;
  timelineToggle.setAttribute('aria-expanded', String(open));
  timelineToggle.setAttribute('aria-label', open ? 'Collapse playback' : 'Open playback');
  timelineToggle.title = open ? 'Collapse playback' : 'Open playback';
  // Pausing on collapse prevents hidden playback from changing the selected map time.
  window.dispatchEvent(new Event(open ? 'playback-open' : 'playback-close'));
  if (restoreFocus) timelineToggle.focus();
}
timelineToggle.addEventListener('click', () => setPlaybackOpen(timelineDialog.hidden));
document.getElementById('closeTimeline').addEventListener('click', () => setPlaybackOpen(false));
// Escape only collapses playback when focus is in the dock; map tools keep their own Escape action.
timelineDialog.addEventListener('keydown', event => {
  if (event.key === 'Escape') { setPlaybackOpen(false); event.stopPropagation(); }
});
