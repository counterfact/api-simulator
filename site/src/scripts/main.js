function copyCmd() {
  const installCmd = document.getElementById("install-cmd")?.textContent?.trim();
  if (!installCmd) {
    return;
  }

  navigator.clipboard
    .writeText(installCmd)
    .then(() => {
      const btn = document.getElementById("copy-btn");
      btn.textContent = "copied!";
      btn.style.color = "#4ecb8d";
      setTimeout(() => {
        btn.textContent = "copy";
        btn.style.color = "";
      }, 2000);
    })
    .catch(() => {});
}

document.getElementById("copy-btn")?.addEventListener("click", copyCmd);

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.style.opacity = "1";
        e.target.style.transform = "none";
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.08 },
);

document.querySelectorAll(".feat, .step, .aud-card").forEach((el) => {
  el.style.opacity = "0";
  el.style.transform = "translateY(14px)";
  el.style.transition = "opacity .5s ease, transform .5s ease";
  io.observe(el);
});
