function copyCmd() {
  const installCmd = document.getElementById("install-cmd")?.textContent?.trim();
  if (!installCmd) {
    return;
  }

  navigator.clipboard
    .writeText(installCmd)
    .then(() => {
      const btn = document.getElementById("copy-btn");
      btn.textContent = "Copied";
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 2000);
    })
    .catch(() => {});
}

document.getElementById("copy-btn")?.addEventListener("click", copyCmd);
