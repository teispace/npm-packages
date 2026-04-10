'use client';

import { $isCodeNode } from '@lexical/code';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNearestNodeFromDOMNode } from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'php',
  'ruby',
  'swift',
  'kotlin',
  'html',
  'css',
  'sql',
  'bash',
  'json',
  'yaml',
  'markdown',
  'xml',
  'plain',
];

// ---------------------------------------------------------------------------
// CodeActionMenuPlugin
// ---------------------------------------------------------------------------

/**
 * Floating action bar that appears on code blocks.
 * Shows language selector and copy button.
 * Replaces the need for a separate CodeBar registry component.
 */
export function CodeActionMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const [codeNodeKey, setCodeNodeKey] = useState<string | null>(null);
  const [language, setLanguage] = useState('');
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const [copied, setCopied] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const handleMouseMove = (e: MouseEvent) => {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = setTimeout(() => {
        const target = (e.target as HTMLElement).closest('code.tei-code-block, pre');
        if (!target) {
          // Delay hiding so user can interact with the bar
          hoverTimeout.current = setTimeout(() => setCodeNodeKey(null), 200);
          return;
        }

        editor.getEditorState().read(() => {
          const node = $getNearestNodeFromDOMNode(target as HTMLElement);
          if (node && $isCodeNode(node)) {
            setCodeNodeKey(node.getKey());
            setLanguage(node.getLanguage() || 'plain');
            const rect = target.getBoundingClientRect();
            setPosition({ top: rect.top + 4, right: window.innerWidth - rect.right + 4 });
          } else {
            setCodeNodeKey(null);
          }
        });
      }, 80);
    };

    const handleMouseLeave = () => {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = setTimeout(() => setCodeNodeKey(null), 300);
    };

    root.addEventListener('mousemove', handleMouseMove);
    root.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      clearTimeout(hoverTimeout.current);
      root.removeEventListener('mousemove', handleMouseMove);
      root.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [editor]);

  const handleLanguageChange = useCallback(
    (newLang: string) => {
      if (!codeNodeKey) return;
      setLanguage(newLang);
      editor.update(() => {
        const node = editor.getEditorState()._nodeMap.get(codeNodeKey);
        if (node && $isCodeNode(node)) {
          node.setLanguage(newLang);
        }
      });
    },
    [editor, codeNodeKey],
  );

  const handleCopy = useCallback(() => {
    if (!codeNodeKey) return;
    editor.getEditorState().read(() => {
      const node = editor.getEditorState()._nodeMap.get(codeNodeKey);
      if (node) {
        navigator.clipboard.writeText(node.getTextContent());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    });
  }, [editor, codeNodeKey]);

  if (!codeNodeKey || typeof window === 'undefined') return null;

  return createPortal(
    <div
      ref={barRef}
      className="tei-code-action-menu fixed z-40 flex items-center gap-1.5 rounded-md border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))] px-2 py-1 shadow-sm"
      style={{ top: position.top, right: position.right }}
      onMouseEnter={() => clearTimeout(hoverTimeout.current)}
      onMouseLeave={() => {
        hoverTimeout.current = setTimeout(() => setCodeNodeKey(null), 200);
      }}
    >
      <select
        value={language}
        onChange={(e) => handleLanguageChange(e.target.value)}
        className="h-6 rounded border-none bg-transparent text-xs text-[hsl(var(--tei-fg))] outline-none cursor-pointer"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {lang}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleCopy}
        className="flex h-6 items-center gap-1 rounded px-1.5 text-xs text-[hsl(var(--tei-muted-fg))] hover:bg-[hsl(var(--tei-accent))] hover:text-[hsl(var(--tei-fg))]"
        title="Copy code"
      >
        {copied ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
        <span>{copied ? 'Copied!' : 'Copy'}</span>
      </button>
    </div>,
    document.body,
  );
}
