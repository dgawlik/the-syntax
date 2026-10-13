function enableCopyButtons() {
  document.querySelectorAll(".copy-button").forEach((button) => {
    const code = button.closest(".example-card")?.querySelector("code");

    if (!code) {
      return;
    }

    button.addEventListener("click", async () => {
      const label = button.textContent;

      try {
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = "Copied";
      } catch {
        button.textContent = "Copy unavailable";
      }

      window.setTimeout(() => {
        button.textContent = label;
      }, 1800);
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", enableCopyButtons, { once: true });
} else {
  enableCopyButtons();
}
