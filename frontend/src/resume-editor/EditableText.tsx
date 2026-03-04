import { useState, useRef, useEffect } from 'react';

export interface EditableTextProps {
  value: string;
  path: string;
  onCommit: (path: string, value: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}

export function EditableText({
  value,
  path,
  onCommit,
  className = '',
  placeholder = '',
  multiline = false,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = local.trim();
    if (trimmed !== value) {
      onCommit(path, trimmed);
    } else {
      setLocal(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      setLocal(value);
      setEditing(false);
      inputRef.current?.blur();
    }
  };

  if (editing) {
    const inputClass =
      'w-full min-h-[44px] py-1.5 px-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none ' +
      (className || '');
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className={inputClass}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        className={inputClass}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
    );
  }

  const displayValue = value || placeholder;
  return (
    <span
      role="button"
      tabIndex={0}
      className={
        'min-h-[44px] inline-flex items-center py-1.5 px-2 rounded cursor-text border border-transparent hover:border-gray-300 touch-manipulation ' +
        (className || '')
      }
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {displayValue || <span className="text-gray-400">{placeholder || 'Click to edit'}</span>}
    </span>
  );
}
