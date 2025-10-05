const sendToggle = document.getElementById("sendToggle");
const statusDiv = document.getElementById("status") || document.createElement('div');

// load toggle
chrome.storage.sync.get("sendToBackend", ({ sendToBackend }) => {
  sendToggle.checked = !!sendToBackend;
  statusDiv.textContent = sendToBackend ? "Sending enabled" : "Sending disabled";
});

sendToggle.addEventListener("change", () => {
  const enabled = sendToggle.checked;
  chrome.storage.sync.set({ sendToBackend: enabled }, () => {
    statusDiv.textContent = enabled ? "Sending enabled" : "Sending disabled";
    statusDiv.style.color = enabled ? "green" : "black";
  });
});