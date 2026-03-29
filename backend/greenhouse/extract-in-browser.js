/**
 * In-browser extraction logic for Greenhouse apply forms.
 * Loaded as raw string and evaluated in the page context (no bundler = no __name).
 *
 * Bottom-up approach: finds every form control, resolves its label,
 * deduplicates radio/checkbox groups, returns the full field list.
 * No container-class whitelist — new sections are picked up automatically.
 */
window.__extractGreenhouseFields = function () {
  var form = document.getElementById('application-form');
  if (!form) form = document.querySelector('form.application--form');
  if (!form) form = document.querySelector('form');
  if (!form) return [];

  var results = [];
  var processed = {};

  function textOf(el) {
    if (!el) return '';
    return (el.textContent || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  }

  function escapeId(id) {
    if (typeof CSS !== 'undefined' && CSS.escape) return '#' + CSS.escape(id);
    if (/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(id)) return '#' + id;
    return '[id="' + id.replace(/"/g, '\\"') + '"]';
  }

  function escapeName(n) {
    return n.replace(/"/g, '\\"');
  }

  var allControls = form.querySelectorAll('input, textarea, select');

  for (var i = 0; i < allControls.length; i++) {
    var control = allControls[i];
    var tagName = control.tagName.toLowerCase();
    var type = (control.getAttribute('type') || '').toLowerCase();
    var role = (control.getAttribute('role') || '').toLowerCase();
    var id = control.id || '';
    var name = control.getAttribute('name') || '';

    // --- Skip utility / non-field controls ---
    if (type === 'hidden' || type === 'submit' || type === 'button') continue;
    if (control.getAttribute('aria-hidden') === 'true' && type !== 'file') continue;
    if (control.classList.contains('remix-css-1a0ro4n-requiredInput')) continue;
    if (control.classList.contains('iti__search-input')) continue;

    // --- Deduplicate radio/checkbox groups by name, others by id ---
    var dedupKey = '';
    if (type === 'radio' || type === 'checkbox') {
      dedupKey = 'group:' + name;
    } else {
      dedupKey = 'ctrl:' + (id || name || String(i));
    }
    if (processed[dedupKey]) continue;
    processed[dedupKey] = true;

    // ── Label resolution ────────────────────────────────────
    var label = '';

    // Radio/checkbox: use the fieldset legend as the group label
    if ((type === 'radio' || type === 'checkbox') && name) {
      var fieldset = control.closest('fieldset');
      if (fieldset) {
        var legend = fieldset.querySelector('legend');
        label = textOf(legend);
        if (!label) { var p = fieldset.querySelector('p'); label = textOf(p); }
      }
    }

    // File input: use .upload-label inside the upload group
    if (type === 'file' && !label) {
      var group = control.closest('.file-upload') || control.closest('[role="group"]');
      if (group) { label = textOf(group.querySelector('.upload-label')); }
    }

    // label[for="id"]
    if (!label && id) {
      label = textOf(form.querySelector('label[for="' + escapeName(id) + '"]'));
    }
    // aria-labelledby (space-separated IDs — use first that resolves)
    if (!label) {
      var alBy = control.getAttribute('aria-labelledby');
      if (alBy) {
        var ids = alBy.split(/\s+/);
        for (var li = 0; li < ids.length && !label; li++) {
          var lel = document.getElementById(ids[li]);
          if (lel) label = textOf(lel);
        }
      }
    }
    // aria-label / placeholder fallback
    if (!label) label = (control.getAttribute('aria-label') || '').trim();
    if (!label) label = (control.getAttribute('placeholder') || '').trim();

    if (!label) continue;

    // ── Field type ──────────────────────────────────────────
    var fieldType = 'text';
    if (type === 'file') fieldType = 'file_upload';
    else if (type === 'radio') fieldType = 'radio';
    else if (type === 'checkbox') fieldType = 'checkbox';
    else if (role === 'combobox') fieldType = 'select';
    else if (tagName === 'select') fieldType = 'select';
    else if (tagName === 'textarea') fieldType = 'textarea';

    // ── Required ────────────────────────────────────────────
    var required = control.getAttribute('aria-required') === 'true' ||
      control.hasAttribute('required');
    if (type === 'file') {
      var fg = control.closest('[role="group"]');
      required = fg ? fg.getAttribute('aria-required') === 'true' : false;
    }
    if (role === 'combobox' && !required) {
      var shell = control.closest('.select-shell');
      if (shell && shell.querySelector('.remix-css-1a0ro4n-requiredInput')) required = true;
    }
    if ((type === 'checkbox' || type === 'radio') && !required) {
      var fs = control.closest('fieldset');
      if (fs && fs.getAttribute('aria-required') === 'true') required = true;
      var fw = control.closest('.field-wrapper');
      if (fw && fw.querySelector('.required')) required = true;
    }

    // ── Selector ────────────────────────────────────────────
    var selector = '';
    if (type === 'radio') {
      selector = name ? 'input[type="radio"][name="' + escapeName(name) + '"]' : 'input[type="radio"]';
    } else if (type === 'checkbox') {
      selector = name ? 'input[name="' + escapeName(name) + '"]' : 'input[type="checkbox"]';
    } else if (id) {
      selector = escapeId(id);
    } else if (name) {
      selector = tagName + '[name="' + escapeName(name) + '"]';
    }

    // ── Options (radio / checkbox / native select) ──────────
    var options;
    if (type === 'radio' && name) {
      options = [];
      var radios = form.querySelectorAll('input[type="radio"][name="' + escapeName(name) + '"]');
      for (var r = 0; r < radios.length; r++) {
        var radio = radios[r];
        var ol = radio.id ? form.querySelector('label[for="' + radio.id + '"]') : null;
        options.push({ label: textOf(ol) || radio.value, value: radio.value });
      }
    }
    if (type === 'checkbox' && name) {
      options = [];
      var checks = form.querySelectorAll('input[type="checkbox"][name="' + escapeName(name) + '"]');
      for (var c = 0; c < checks.length; c++) {
        var chk = checks[c];
        var cl = chk.id ? form.querySelector('label[for="' + chk.id + '"]') : null;
        options.push({ label: textOf(cl) || chk.value, value: chk.value });
      }
    }
    if (tagName === 'select') {
      options = [];
      for (var o = 0; o < control.options.length; o++) {
        var opt = control.options[o];
        options.push({ label: (opt.textContent || '').trim() || opt.value, value: opt.value });
      }
    }

    // ── Helper text / instructions ──────────────────────────
    var instructions;
    var cur = control.parentElement;
    while (cur && cur !== form) {
      var helpEl = cur.querySelector('.question-description, .helper-text, small');
      if (helpEl) { instructions = textOf(helpEl); break; }
      cur = cur.parentElement;
    }

    results.push({
      rawLabel: label,
      rawInstructions: instructions,
      fieldType: fieldType,
      required: required,
      options: options,
      inputId: id,
      inputName: name,
      inputSelector: selector,
      fileInputName: type === 'file' ? (id || name || 'resume') : undefined,
    });
  }

  return results;
};
