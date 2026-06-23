import React from 'react';

interface MarkdownViewProps {
  content: string;
}

export function MarkdownView({ content }: MarkdownViewProps) {
  if (!content) {
    return <p className="text-gray-400 italic">No notes available. Click Edit Content to write some!</p>;
  }

  const lines = content.split('\n');
  const renderedElements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeLanguage = '';

  let inMathBlock = false;
  let mathBlockLines: string[] = [];

  const parseInlineStyles = (text: string): React.ReactNode[] => {
    // Basic inline bold and code formatting
    // Match **bold** and `code`
    const parts: React.ReactNode[] = [];
    let currentIndex = 0;

    // Use a regex to identify bold or inline-code
    const regex = /(\*\*([^*]+)\*\*|`([^`]+)`|\$\$([^$]+)\$\$)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;

      // Add preceding plain text
      if (matchIndex > currentIndex) {
        parts.push(text.substring(currentIndex, matchIndex));
      }

      if (match[2]) {
        // Bold
        parts.push(
          <strong key={matchIndex} className="font-semibold text-gray-950 bg-amber-50 px-0.5 rounded">
            {match[2]}
          </strong>
        );
      } else if (match[3]) {
        // Inline backtick code
        parts.push(
          <code key={matchIndex} className="font-mono text-xs px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-rose-600 rounded">
            {match[3]}
          </code>
        );
      } else if (match[4]) {
        // Inline math
        parts.push(
          <span key={matchIndex} className="font-serif italic text-amber-800 bg-amber-50/50 px-1 border border-amber-100 rounded">
            {match[4]}
          </span>
        );
      }

      currentIndex = regex.lastIndex;
    }

    if (currentIndex < text.length) {
      parts.push(text.substring(currentIndex));
    }

    return parts.length > 0 ? parts : [text];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle Code Block
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // Close code block
        const codeText = codeBlockLines.join('\n');
        renderedElements.push(
          <div key={`code-${i}`} className="my-4 font-mono text-xs bg-slate-900 text-slate-100 rounded-lg overflow-hidden border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950 text-slate-400 border-b border-slate-800">
              <span>{codeLanguage || 'typescript'}</span>
              <button 
                onClick={() => navigator.clipboard.writeText(codeText)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer text-[10px] bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 rounded"
              >
                Copy
              </button>
            </div>
            <pre className="p-4 overflow-x-auto leading-relaxed">
              <code>{codeText}</code>
            </pre>
          </div>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        // Open code block
        inCodeBlock = true;
        codeLanguage = line.trim().substring(3);
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Handle multiline $$ block math
    if (line.trim() === '$$') {
      if (inMathBlock) {
        const mathText = mathBlockLines.join('\n');
        renderedElements.push(
          <div key={`mathblk-${i}`} className="my-4 p-4 text-center bg-amber-50/15 border border-amber-200/50 rounded-xl shadow-xs font-serif italic text-base md:text-lg text-amber-950 leading-relaxed">
            {mathText}
          </div>
        );
        mathBlockLines = [];
        inMathBlock = false;
      } else {
        inMathBlock = true;
      }
      continue;
    }

    if (inMathBlock) {
      mathBlockLines.push(line);
      continue;
    }

    // Normal parsing
    const trimmed = line.trim();

    if (trimmed === '') {
      renderedElements.push(<div key={`empty-${i}`} className="h-2" />);
      continue;
    }

    // Centered block Math
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
      const equation = trimmed.substring(2, trimmed.length - 2);
      renderedElements.push(
        <div key={`math-${i}`} className="my-4 p-4 text-center bg-amber-50/30 border border-amber-100 rounded-lg shadow-inner font-serif italic text-lg text-amber-900">
          {equation}
        </div>
      );
      continue;
    }

    // H1
    if (trimmed.startsWith('# ')) {
      renderedElements.push(
        <h1 key={`h1-${i}`} className="text-2xl font-bold text-slate-900 border-b border-slate-100 pb-1.5 mb-3 mt-5 tracking-tight">
          {parseInlineStyles(trimmed.substring(2))}
        </h1>
      );
      continue;
    }

    // H2
    if (trimmed.startsWith('## ')) {
      renderedElements.push(
        <h2 key={`h2-${i}`} className="text-xl font-semibold text-slate-800 mb-2.5 mt-4 tracking-tight">
          {parseInlineStyles(trimmed.substring(3))}
        </h2>
      );
      continue;
    }

    // H3
    if (trimmed.startsWith('### ')) {
      renderedElements.push(
        <h3 key={`h3-${i}`} className="text-lg font-medium text-slate-700 mb-2 mt-3.5">
          {parseInlineStyles(trimmed.substring(4))}
        </h3>
      );
      continue;
    }

    // Bullet List Items
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      renderedElements.push(
        <li key={`li-${i}`} className="ml-5 list-disc text-sm text-slate-700 leading-relaxed my-1">
          {parseInlineStyles(trimmed.substring(2))}
        </li>
      );
      continue;
    }

    // Standard Paragraph
    renderedElements.push(
      <p key={`p-${i}`} className="text-sm text-slate-700 leading-relaxed my-1.5">
        {parseInlineStyles(line)}
      </p>
    );
  }

  return <div className="space-y-1">{renderedElements}</div>;
}
