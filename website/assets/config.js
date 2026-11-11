/*
 * SAHASRA website settings — edit this one file.
 *
 * APP_URL: where the SAHASRA software runs. Login, Sign up and Buy buttons open it.
 * COMPANY: your business details, shown on the Contact and policy pages (PayU checks these).
 * PLANS: prices shown on the website. Keep them the same as the software
 *        (backend/src/lib/subscription.ts), which is what customers are actually charged.
 */
window.SAHASRA = {
  APP_URL: 'https://app.sahaasra.in',

  COMPANY: {
    legalName: 'SAHASRA',
    address: 'Add your registered address here',
    email: 'astronnlabs@gmail.com',
    phone: '+91 62908 54388',
    gstin: '',
  },

  PLANS: [
    { period: 'monthly', label: 'Monthly', price: 1, months: 1, note: 'per month' },
    { period: 'quarterly', label: 'Quarterly', price: 2, months: 3, note: 'for 3 months' },
    { period: 'yearly', label: 'Yearly', price: 3, months: 12, note: 'for 12 months', best: true },
  ],
};

(function () {
  var cfg = window.SAHASRA;
  var app = cfg.APP_URL.replace(/\/+$/, '');

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    // Buttons that open the software.
    document.querySelectorAll('[data-app]').forEach(function (el) {
      var to = el.getAttribute('data-app');
      var url = to === 'login' ? app + '/login' : app + '/signup';
      var period = el.getAttribute('data-period');
      if (to === 'signup' && period) url += '?plan=build&period=' + encodeURIComponent(period);
      el.setAttribute('href', url);
    });

    // Company details.
    document.querySelectorAll('[data-company]').forEach(function (el) {
      var key = el.getAttribute('data-company');
      var value = cfg.COMPANY[key];
      if (!value) {
        // An empty optional detail (e.g. GSTIN) hides its whole row.
        var row = el.closest('[data-optional-row]');
        if (row) row.remove();
        return;
      }
      el.textContent = value;
      if (el.tagName === 'A' && key === 'email') el.setAttribute('href', 'mailto:' + value);
      if (el.tagName === 'A' && key === 'phone') el.setAttribute('href', 'tel:' + value.replace(/[^\d+]/g, ''));
    });

    // Prices.
    document.querySelectorAll('[data-price]').forEach(function (el) {
      var p = cfg.PLANS.filter(function (x) { return x.period === el.getAttribute('data-price'); })[0];
      if (p) el.textContent = '₹' + p.price;
    });
    var from = Math.min.apply(null, cfg.PLANS.map(function (p) { return p.price; }));
    document.querySelectorAll('[data-price-from]').forEach(function (el) { el.textContent = '₹' + from; });

    // Year in the footer.
    document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

    // Mobile menu.
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.querySelector('.site-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
  });
})();
