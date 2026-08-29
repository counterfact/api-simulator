/* global document, window */

import "./style.css";

const profileId =
  new URLSearchParams(window.location.search).get("profile") ?? "1";
const status = document.querySelector("#status");
const detail = document.querySelector("#detail");

try {
  const response = await fetch(`http://localhost:4321/profiles/${profileId}`);

  if (response.status === 404) {
    status.textContent = "Profile not found";
    detail.textContent = "Choose another profile.";
  } else if (!response.ok) {
    status.setAttribute("role", "alert");
    status.textContent = "Profile temporarily unavailable";
    detail.textContent = "Please try again.";
  } else {
    const profile = await response.json();
    status.textContent = profile.name;
    detail.textContent = `Profile ${profile.id}`;
  }
} catch {
  status.setAttribute("role", "alert");
  status.textContent = "Profile temporarily unavailable";
  detail.textContent = "Please try again.";
}
