/**
 * In-browser extraction logic for Handshake apply modal.
 * Loaded as raw string and evaluated in the page context (no bundler = no __name).
 * Must assign to window.__extractHandshakeForm so Node can call it via new Function.
 */
window.__extractHandshakeForm = function (modal) {
  var fields = [];
  function text(el) {
    return el ? (el.textContent || '').trim() : '';
  }
  function isRequired(label, el) {
    if (/\(required\)/i.test(label)) return true;
    if (el && (el.hasAttribute('required') || el.getAttribute('aria-required') === 'true')) return true;
    return false;
  }
  function detectSectionCategory(heading, parentHeading) {
    var combined = (heading + ' ' + (parentHeading || '')).toLowerCase();
    if (/equal opportunity|eeo|eeoc|diversity/i.test(combined)) return 'eeo';
    if (/screening question/i.test(combined)) return 'screening_questions';
    if (/attach|upload|document|resume|cover|transcript/i.test(combined)) return 'document_upload';
    return 'employer_questions';
  }
  function findSectionContext(el) {
    var current = el;
    while (current && current !== modal) {
      var h5 = current.querySelector(':scope > h5, :scope > .sc-ckqUJP');
      if (h5) {
        var heading = text(h5);
        if (heading && heading.length > 2) {
          return { heading: heading, category: detectSectionCategory(heading) };
        }
      }
      var prev = current.previousElementSibling;
      if (prev) {
        var headingEl = prev.querySelector('h5');
        if (headingEl) {
          var h = text(headingEl);
          if (h) return { heading: h, category: detectSectionCategory(h) };
        }
      }
      current = current.parentElement;
    }
    return { heading: '', category: 'other' };
  }

  var fieldsets = modal.querySelectorAll('fieldset');
  for (var i = 0; i < fieldsets.length; i++) {
    var fs = fieldsets[i];
    var legendEl = fs.querySelector('legend');
    var heading = text(legendEl);
    var fileInput = fs.querySelector('input[type="file"]');
    var searchInput = fs.querySelector('input[type="search"]');

    if (fileInput || searchInput) {
      var instructions;
      var allSpans = fs.querySelectorAll('span');
      for (var s = 0; s < allSpans.length; s++) {
        var spanText = (allSpans[s].textContent || '').trim();
        if (/instructions?\s+from\s+employer/i.test(spanText)) {
          var sibling = allSpans[s].nextElementSibling;
          if (sibling) instructions = (sibling.textContent || '').trim();
          break;
        }
      }
      fields.push({
        rawLabel: heading || 'File upload',
        rawInstructions: instructions,
        fieldType: 'file_upload',
        required: true,
        sectionHeading: heading,
        sectionCategory: 'document_upload',
        selectors: {
          inputSelector: fileInput
            ? 'input[name="' + (fileInput.getAttribute('name') || '') + '"]'
            : 'input[type="file"]',
          fileInputName: fileInput ? fileInput.getAttribute('name') || undefined : undefined,
          searchPlaceholder: searchInput ? searchInput.getAttribute('placeholder') || undefined : undefined,
        },
      });
      continue;
    }

    var radioGroup = fs.querySelector('[role="radiogroup"]');
    if (radioGroup) {
      var label = text(fs.querySelector('legend')) || text(fs.querySelector('p'));
      var radios = radioGroup.querySelectorAll('input[type="radio"]');
      var options = [];
      for (var r = 0; r < radios.length; r++) {
        var radio = radios[r];
        var labelEl = radio.id ? fs.querySelector('label[for="' + radio.id + '"]') : null;
        var optLabel = text(labelEl) || radio.value;
        options.push({ label: optLabel, value: radio.value });
      }
      var ctx = findSectionContext(fs);
      fields.push({
        rawLabel: label,
        fieldType: 'radio',
        required: !/(optional|voluntary)/i.test(label),
        options: options,
        sectionHeading: ctx.heading,
        sectionCategory: ctx.category,
        selectors: {
          inputSelector: '[role="radiogroup"]',
        },
      });
    }
  }

  var allTextInputs = modal.querySelectorAll('input[type="text"]');
  for (var t = 0; t < allTextInputs.length; t++) {
    var inp = allTextInputs[t];
    var parentFieldset = inp.closest('fieldset');
    if (parentFieldset && parentFieldset.querySelector('input[type="file"], input[type="search"]')) continue;
    var labelId = inp.getAttribute('aria-labelledby') || (inp.id ? inp.id + '-label' : '');
    var labelEl = labelId ? modal.querySelector('#' + labelId) : null;
    var inpLabel = text(labelEl) || inp.getAttribute('placeholder') || inp.name || '';
    if (!inpLabel) continue;
    var ctx = findSectionContext(inp);
    var inpName = inp.getAttribute('name') || '';
    fields.push({
      rawLabel: inpLabel,
      fieldType: 'text',
      required: isRequired(inpLabel, inp),
      sectionHeading: ctx.heading,
      sectionCategory: ctx.category,
      selectors: {
        inputSelector: inpName ? 'input[name="' + inpName + '"]' : (inp.id ? '#' + inp.id : 'input[type="text"]'),
        inputName: inpName || undefined,
      },
    });
  }

  var comboboxes = modal.querySelectorAll('[role="combobox"]');
  for (var c = 0; c < comboboxes.length; c++) {
    var combo = comboboxes[c];
    var searchInside = combo.querySelector('input[type="search"]');
    if (!searchInside && combo.tagName === 'INPUT' && (combo.getAttribute('type') || '').toLowerCase() === 'search') {
      searchInside = combo;
    }
    if (searchInside) {
      var parentFieldset = combo.closest('fieldset');
      if (parentFieldset && parentFieldset.querySelector('input[type="file"]')) continue;
      var dataSizeEl = combo.closest('[data-size]');
      var parentEl = dataSizeEl && dataSizeEl.parentElement;
      var grandparentEl = parentEl && parentEl.parentElement;
      var multiList = dataSizeEl
        ? (dataSizeEl.querySelector('ul[aria-multiselectable="true"]') ||
           (parentEl && parentEl.querySelector('ul[aria-multiselectable="true"]')) ||
           (grandparentEl && grandparentEl.querySelector('ul[aria-multiselectable="true"]')))
        : null;
      if (multiList) {
        var labelId = searchInside.getAttribute('aria-labelledby') || '';
        var labelEl = labelId ? modal.querySelector('#' + labelId) : null;
        var comboLabel = text(labelEl);
        var listboxId = (searchInside.getAttribute('aria-controls') || '').split(' ')[0] || '';
        var listbox = listboxId ? modal.querySelector('#' + listboxId) : null;
        var comboOptions = [];
        if (listbox) {
          var opts = listbox.querySelectorAll('[role="option"]');
          for (var o = 0; o < opts.length; o++) {
            var opt = opts[o];
            comboOptions.push({ label: text(opt), value: text(opt) });
          }
        }
        var multiSelectEl = dataSizeEl
          ? (dataSizeEl.querySelector('select[multiple]') ||
             (parentEl && parentEl.querySelector('select[multiple]')) ||
             (grandparentEl && grandparentEl.querySelector('select[multiple]')))
          : null;
        var multiSelectName = multiSelectEl ? multiSelectEl.getAttribute('name') || '' : '';
        var comboCtx = findSectionContext(searchInside);
        fields.push({
          rawLabel: comboLabel,
          fieldType: 'multi_select',
          required: isRequired(comboLabel),
          options: comboOptions,
          sectionHeading: comboCtx.heading,
          sectionCategory: comboCtx.category,
          selectors: {
            inputSelector: multiSelectName ? 'select[name="' + multiSelectName.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]' : '[role="combobox"] input[type="search"]',
            selectName: multiSelectName || undefined,
          },
        });
      }
      continue;
    }

    var outputEl = combo.querySelector('output');
    if (!outputEl) continue;
    var outLabelId = combo.getAttribute('aria-labelledby') || '';
    /**
     * aria-labelledby comes in the format of: "id-<id>-label" e.g. id-962cc116-542c-4c6b-a68f-9eb7322705fd-label
     * We need to extract the id from the aria-labelledby and use it to query the label element
     * id = id-962cc116-542c-4c6b-a68f-9eb7322705fd
     */
    var id = outLabelId.replace(/-label$/, "");
    var outLabelEl = outLabelId ? modal.querySelector('#' + outLabelId) : null;
    var outLabel = text(outLabelEl);
    if (!outLabel) continue;
    var listboxId = combo.getAttribute('aria-controls') || '';
    var listbox = listboxId ? modal.querySelector('#' + listboxId) : null;
    var selectOptions = [];
    var selectOptionSelectors = {};
    var hiddenSelect = modal.querySelector('#' + id)
    // var hiddenOptions = hiddenSelect ? Array.prototype.slice.call(hiddenSelect.options) : [];
    if (listbox) {
      var listboxOpts = listbox.querySelectorAll('[role="option"]');
      for (var l = 0; l < listboxOpts.length; l++) {
        var optItem = listboxOpts[l];
        var ol = text(optItem);
        if (ol === 'Select One') continue;
        // var hiddenVal = (hiddenOptions[l] && (hiddenOptions[l].value || (hiddenOptions[l].textContent || '').trim())) || '';
        var v = ol;
        selectOptions.push({ label: ol, value: v });
        selectOptionSelectors[v] = optItem.id ? '#' + optItem.id : '';
      }
    }
    var selectName = hiddenSelect ? hiddenSelect.name : '';
    var selectCtx = findSectionContext(combo);
    fields.push({
      rawLabel: outLabel,
      fieldType: 'select',
      required: /\(required\)/i.test(outLabel),
      options: selectOptions,
      sectionHeading: selectCtx.heading,
      sectionCategory: selectCtx.category,
      selectors: {
        inputSelector: selectName ? 'select[name="' + selectName + '"]' : (hiddenSelect && hiddenSelect.id ? '#' + hiddenSelect.id : 'select[readonly]'),
        selectName: selectName || undefined,
      },
    });
  }

  return fields;
};
