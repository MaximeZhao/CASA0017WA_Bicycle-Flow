"use strict";
const feedbackForm = document.getElementById("feedbackForm");
if (feedbackForm) feedbackForm.addEventListener("submit", async event => {
  event.preventDefault();
  const field = document.getElementById("feedbackMessage");
  const message = field.value.trim();
  if (!message) { field.focus(); return; }
  const topic = document.getElementById("feedbackTopic").value;
  const state = BikeSite.read();
  const context = [state.station, state.date, state.time, state.mode].filter(Boolean).join(" · ");
  const note = "Mind The Dock feedback\nTopic: " + topic + "\n" + (context ? "View: " + context + "\n" : "") + "\n" + message;
  const status = document.getElementById("feedbackStatus");
  try { await navigator.clipboard.writeText(note); status.textContent = "Copied. You can now share your note with the project team."; }
  catch { field.select(); status.textContent = "Select and copy your message, then share it with the project team."; }
});
