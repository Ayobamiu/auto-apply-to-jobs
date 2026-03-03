export interface CoverLetterEditorApi {
  getValue(): string;
}

export function createCoverLetterEditor(
  container: HTMLElement,
  initialText: string,
  previewContainer: HTMLElement
): CoverLetterEditorApi {
  container.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'cover-editor-toolbar';
  toolbar.innerHTML = `
    <button type="button" data-cmd="bold" class="cover-editor-btn">Bold</button>
    <button type="button" data-cmd="italic" class="cover-editor-btn">Italic</button>
    <button type="button" data-cmd="ul" class="cover-editor-btn">Bulleted list</button>
    <span class="cover-editor-word-count" aria-live="polite"></span>
  `;

  const editor = document.createElement('div');
  editor.className = 'cover-editor-surface';
  editor.contentEditable = 'true';
  editor.spellcheck = true;
  editor.innerText = initialText || '';

  container.appendChild(toolbar);
  container.appendChild(editor);

  const wordCountEl = toolbar.querySelector('.cover-editor-word-count') as HTMLElement | null;

  const updatePreviewAndCount = (): void => {
    const text = editor.innerText || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    if (wordCountEl) {
      wordCountEl.textContent = `${words} word${words === 1 ? '' : 's'}`;
    }
    previewContainer.textContent = text;
  };

  toolbar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button[data-cmd]') as HTMLButtonElement | null;
    if (!btn) return;
    const cmd = btn.getAttribute('data-cmd');
    editor.focus();
    if (cmd === 'bold') {
      document.execCommand('bold');
    } else if (cmd === 'italic') {
      document.execCommand('italic');
    } else if (cmd === 'ul') {
      document.execCommand('insertUnorderedList');
    }
    updatePreviewAndCount();
  });

  editor.addEventListener('input', () => {
    updatePreviewAndCount();
  });

  updatePreviewAndCount();

  const getValue = (): string => {
    return editor.innerText || '';
  };

  return { getValue };
}

