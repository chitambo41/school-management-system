/**
 * Opportunity School Management System - shared front-end helpers.
 * Small utilities: flash auto-dismiss, search filters, mark entry helpers.
 */

// Auto-dismiss dismissible alerts after 5 seconds
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.alert-dismissible').forEach((el) => {
    setTimeout(() => {
      if (el && el.parentNode) {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
      }
    }, 5000);
  });

  // Per-page initializers
  initSearchFilters();
  initMarksTable();
  initClassFilter();
});

// Filter table rows by text input (elements with data-search-target -> "tableId")
function initSearchFilters() {
  document.querySelectorAll('[data-search]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const table = document.querySelector(input.dataset.search);
      if (!table) return;
      table.querySelectorAll('tbody tr').forEach((tr) => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  });
}

// Attach search-on-submit for GET filter forms
function initClassFilter() {
  document.querySelectorAll('[data-filter-form]').forEach((select) => {
    select.addEventListener('change', () => {
      // Simple: navigate keeping current query + chosen value
      const url = new URL(window.location.href);
      const key = select.dataset.filterKey || select.name;
      url.searchParams.set(key, select.value);
      window.location.href = url.toString();
    });
  });
}

// Normalize marks: keep numeric 0-100 in marks entry tables
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

// Confirm dialog for destructive buttons
function confirmDelete(msg = 'Are you sure?') {
  return confirm(msg);
}