import React from 'react';
import Markdown from 'react-markdown';

interface MarkdownViewProps {
  content: string;
}

// Inline math helper
const renderTextWithMath = (text: string) => {
  if (typeof text !== 'string') return text;
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;
  const regex = /\$\$(.*?)\$\$/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > currentIndex) {
      parts.push(text.substring(currentIndex, match.index));
    }
    parts.push(
      <span key={match.index} className="font-serif italic text-amber-800 bg-amber-50/50 px-1.5 py-0.5 border border-amber-100 rounded mx-0.5 shadow-2xs">
        {match[1]}
      </span>
    );
    currentIndex = regex.lastIndex;
  }
  if (currentIndex < text.length) {
    parts.push(text.substring(currentIndex));
  }
  return parts.length > 0 ? parts : text;
};

// Process children recursively to catch any text nodes containing math expressions
function processChildrenWithMath(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string') {
    return renderTextWithMath(children);
  }
  if (Array.isArray(children)) {
    return children.map((child, idx) => {
      if (typeof child === 'string') {
        return <React.Fragment key={idx}>{renderTextWithMath(child)}</React.Fragment>;
      }
      return child;
    });
  }
  return children;
}

export function MarkdownView({ content }: MarkdownViewProps) {
  if (!content) {
    return <p className="text-slate-400 italic">No notes available. Click Edit Content to write some!</p>;
  }

  // Pre-process raw notes content to turn $$ block equations into code blocks with the "math" language.
  // This allows us to handle them reliably inside react-markdown's code component.
  let processed = content;
  
  // Replace multi-line $$ blocks
  processed = processed.replace(/\$\$\s*\n([\s\S]*?)\n\s*\$\$/g, '\n```math\n$1\n```\n');
  
  // Replace inline/single-line standalone block math
  processed = processed.replace(/\n\s*\$\$(.*?)\$\$\s*\n/g, '\n```math\n$1\n```\n');

  return (
    <div className="markdown-body text-slate-800 space-y-1 whitespace-pre-wrap">
      <Markdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-slate-900 border-b border-slate-100 pb-1.5 mb-3 mt-5 tracking-tight whitespace-pre-wrap">
              {processChildrenWithMath(children)}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold text-slate-800 mb-2.5 mt-4 tracking-tight whitespace-pre-wrap">
              {processChildrenWithMath(children)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-medium text-slate-700 mb-2 mt-3.5 tracking-tight whitespace-pre-wrap">
              {processChildrenWithMath(children)}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-sm text-slate-700 leading-relaxed my-2 whitespace-pre-wrap">
              {processChildrenWithMath(children)}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 my-2 space-y-1 whitespace-pre-wrap">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1 whitespace-pre-wrap">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm text-slate-700 leading-relaxed my-0.5 whitespace-pre-wrap">
              {processChildrenWithMath(children)}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-950 bg-amber-50 px-0.5 rounded">
              {processChildrenWithMath(children)}
            </strong>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-amber-500 pl-4 italic my-3 text-slate-600 bg-amber-50/10 py-1 rounded-r">
              {processChildrenWithMath(children)}
            </blockquote>
          ),
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const codeText = String(children).replace(/\n$/, '');

            if (language === 'math') {
              return (
                <div className="my-4 p-5 text-center bg-amber-50/25 border border-amber-200/50 rounded-xl shadow-xs font-serif italic text-base md:text-lg text-amber-950 leading-relaxed overflow-x-auto">
                  {codeText}
                </div>
              );
            }

            if (match) {
              // Block code with syntax copy helper
              return (
                <div className="my-4 font-mono text-xs bg-slate-900 text-slate-100 rounded-lg overflow-hidden border border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950 text-slate-400 border-b border-slate-800">
                    <span className="font-mono text-[10px] tracking-wider uppercase text-slate-500 font-bold">{language}</span>
                    <button 
                      type="button"
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
            }

            // Inline code backtick formatting
            return (
              <code className="font-mono text-xs px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-rose-600 rounded">
                {children}
              </code>
            );
          }
        }}
      >
        {processed}
      </Markdown>
    </div>
  );
}
