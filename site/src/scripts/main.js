const copiedFeedbackDuration = 2000;

function captureEvent(event, properties = {}) {
  if (typeof window.posthog?.capture === "function") {
    window.posthog.capture(event, properties);
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the selection-based path for pages without clipboard permission.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "left:-9999px;position:fixed;top:0";
  document.body.append(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand?.("copy") ?? false;
  } catch {
    // Leave the explicit "Copy failed" feedback in place when no fallback exists.
  }
  textarea.remove();
  return copied;
}

function showCopyFeedback(button, copied) {
  const copyLabel =
    button.dataset.copyLabel ??
    button.getAttribute("aria-label") ??
    "Copy code";
  button.dataset.copyLabel = copyLabel;
  const label = copied ? "Copied" : "Copy failed";
  button.textContent = label;
  button.setAttribute(
    "aria-label",
    copied ? "Code copied" : `${copyLabel} failed`,
  );

  window.setTimeout(() => {
    button.textContent = "Copy";
    button.setAttribute("aria-label", copyLabel);
  }, copiedFeedbackDuration);
}

function addCodeCopyButton(code, container) {
  if (container.querySelector(":scope > .copy-button")) return;

  container.classList.add("code-block");
  const button = document.createElement("button");
  button.className = "copy-button code-copy-button";
  button.type = "button";
  button.textContent = "Copy";
  button.setAttribute("aria-label", "Copy code");
  button.addEventListener("click", async () => {
    const copied = await copyText(code.textContent ?? "");
    showCopyFeedback(button, copied);
    if (copied) {
      captureEvent("code_example_copied", {
        section: window.location.pathname,
      });
    }
  });
  container.append(button);
}

function enhanceCodeExamples() {
  document.querySelectorAll("pre > code").forEach((code) => {
    addCodeCopyButton(code, code.parentElement);
  });

  const command = document.getElementById("install-cmd");
  const commandButton = document.getElementById("copy-btn");
  if (command && commandButton) {
    commandButton.addEventListener("click", async () => {
      const copied = await copyText(command.textContent?.trim() ?? "");
      showCopyFeedback(commandButton, copied);
      if (copied) {
        captureEvent("quickstart_command_copied", { section: "homepage" });
      }
    });
  }
}

function trackIntentLinks() {
  document.querySelectorAll("[data-analytics-event]").forEach((element) => {
    if (element.id === "copy-btn") return;

    element.addEventListener("click", () => {
      captureEvent(element.dataset.analyticsEvent, {
        example: element.dataset.analyticsExample,
        href: element.getAttribute("href") ?? undefined,
        section: "homepage",
      });
    });
  });
}

enhanceCodeExamples();
trackIntentLinks();
