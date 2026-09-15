/**
 * Opportunity School Management System - shared front-end helpers.
 * Mobile menu, search filters, mark entry, micro-interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initFlashMessages();
  initSearchFilters();
  initMarksTable();
  initClassFilter();
  initTableSearch();
  initFadeAnimations();
});

/* =====================================================
   MOBILE MENU - Hamburger toggle for sidebar
   ===================================================== */
function initMobileMenu() {
  const hamburger = document.querySelector('.hamburger');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');

  if (!hamburger || !sidebar) return;

  function openMenu() {
    sidebar.classList.add('open');
    if (overlay) { overlay.classList.add('active'); overlay.style.display = 'block'; }
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    sidebar.classList.remove('open');
    if (overlay) { overlay.classList.remove('active'); setTimeout(() => { overlay.style.display = 'none'; }, 300); }
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeMenu() : openMenu();
  });

  if (overlay) {
    overlay.addEventListener('click', closeMenu);
  }

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) closeMenu();
  });

  // Close when clicking a nav link on mobile
  sidebar.querySelectorAll('nav a').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 992) closeMenu();
    });
  });
}

/* =====================================================
   FLASH MESSAGES - Auto-dismiss with slide-out
   ===================================================== */
function initFlashMessages() {
  document.querySelectorAll('.alert-dismissible').forEach((el) => {
    setTimeout(() => {
      if (el && el.parentNode) {
        el.style.animation = 'flashSlideOut .3s ease-in forwards';
        setTimeout(() => el.remove(), 300);
      }
    }, 4500);
  });
}

/* =====================================================
   TABLE SEARCH - Client-side filtering
   ===================================================== */
function initSearchFilters() {
  document.querySelectorAll('[data-search]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const table = document.querySelector(input.dataset.search);
      if (!table) return;
      let hasVisible = false;
      table.querySelectorAll('tbody tr').forEach((tr) => {
        const match = tr.textContent.toLowerCase().includes(q);
        tr.style.display = match ? '' : 'none';
        if (match) hasVisible = true;
      });
      // Show/hide no-results message
      let noResults = table.parentElement.querySelector('.no-results-msg');
      if (!hasVisible) {
        if (!noResults) {
          noResults = document.createElement('div');
          noResults.className = 'no-results-msg text-center text-muted py-3 small';
          noResults.textContent = 'No matching records found.';
          table.parentElement.appendChild(noResults);
        }
      } else if (noResults) {
        noResults.remove();
      }
    });
  });
}

// Also support the inline table-search class on input with data-table attr
function initTableSearch() {
  document.querySelectorAll('.table-search input[data-table]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const table = document.querySelector(input.dataset.table);
      if (!table) return;
      let hasVisible = false;
      table.querySelectorAll('tbody tr').forEach((tr) => {
        const match = tr.textContent.toLowerCase().includes(q);
        tr.style.display = match ? '' : 'none';
        if (match) hasVisible = true;
      });
      let noResults = table.parentElement.querySelector('.no-results-msg');
      if (!hasVisible) {
        if (!noResults) {
          noResults = document.createElement('div');
          noResults.className = 'no-results-msg text-center text-muted py-3 small';
          noResults.textContent = 'No matching records found.';
          table.parentElement.appendChild(noResults);
        }
      } else if (noResults) {
        noResults.remove();
      }
    });
  });
}

/* =====================================================
   FILTER FORMS - Auto-navigate on select change
   ===================================================== */
function initClassFilter() {
  document.querySelectorAll('[data-filter-form]').forEach((select) => {
    select.addEventListener('change', () => {
      const url = new URL(window.location.href);
      const key = select.dataset.filterKey || select.name;
      url.searchParams.set(key, select.value);
      window.location.href = url.toString();
    });
  });
}

/* =====================================================
   MARKS ENTRY - Normalize numeric input
   ===================================================== */
function initMarksTable() {
  document.querySelectorAll('input[type="number"].marks-input').forEach((input) => {
    input.addEventListener('change', () => {
      let v = parseFloat(input.value);
      if (isNaN(v)) v = 0;
      v = Math.max(0, Math.min(100, v));
      input.value = v;
    });
  });
}

/* =====================================================
   FADE ANIMATIONS - Staggered card entrance
   ===================================================== */
function initFadeAnimations() {
  const cards = document.querySelectorAll('.stat-card, .card');
  cards.forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(12px)';
    setTimeout(() => {
      card.style.transition = 'opacity .4s ease, transform .4s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 60 + i * 60);
  });
}

/* =====================================================
   UTILITIES
   ===================================================== */
function confirmDelete(msg = 'Are you sure?') {
  return confirm(msg);
}