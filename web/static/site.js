// Language selection uses the native form so the server remembers the choice
// and returns to the same page. Keep this independent of topology and htmx.
const languageSelect = document.querySelector(".language-switch select");
if (languageSelect) {
  languageSelect.addEventListener("change", () => languageSelect.form.requestSubmit());
}

// Keep anchor targets and automatically scrolled controls below the wrapped header.
const header = document.querySelector('.topbar');
if (header && typeof ResizeObserver !== 'undefined') {
  const updateScrollPadding = () => {
    const height = header.classList.contains('clean') ? 0 : header.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--site-header-height', `${height + 12}px`);
  };
  updateScrollPadding();
  new ResizeObserver(updateScrollPadding).observe(header);
}
