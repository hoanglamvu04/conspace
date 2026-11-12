import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { safeMediaUrl } from '../config.js';

// Intentionally render source Markdown as React elements, never as untrusted HTML.
function safeLink(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('/') && !value.startsWith('//')) return { href: value, internal: true };
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return { href: url.href, internal: false };
  } catch { return null; }
  return null;
}

function renderInline(text, prefix) {
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  const output = [];
  let start = 0;
  let match;
  let n = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > start) output.push(text.slice(start, match.index));
    const key = `${prefix}-${n++}`;
    if (match[1]) {
      const link = safeLink(match[2]);
      output.push(link ? link.internal ? <Link key={key} to={link.href}>{match[1]}</Link> : <a key={key} href={link.href} target="_blank" rel="noopener noreferrer">{match[1]}</a> : match[1]);
    } else if (match[3]) output.push(<strong key={key}>{match[3]}</strong>);
    else if (match[4]) output.push(<code key={key}>{match[4]}</code>);
    else if (match[5]) output.push(<em key={key}>{match[5]}</em>);
    start = pattern.lastIndex;
  }
  if (start < text.length) output.push(text.slice(start));
  return output;
}

export function Markdown({ body }) {
  if (typeof body !== 'string' || !body.trim()) return <p>Nội dung bài viết đang được cập nhật.</p>;
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const nodes = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const key = `block-${i}`;
    if (line.startsWith('```')) {
      const block = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) block.push(lines[i++]);
      nodes.push(<pre key={key}><code>{block.join('\n')}</code></pre>);
      i += 1; continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length + 1;
      const Tag = `h${level}`;
      nodes.push(<Tag key={key}>{renderInline(heading[2], key)}</Tag>);
      i += 1; continue;
    }
    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      const src = safeMediaUrl(image[2]);
      if (src) nodes.push(<figure key={key}><img src={src} alt={image[1]} loading="lazy" decoding="async" /></figure>);
      i += 1; continue;
    }
    if (/^\s*(?:---|\*\*\*)\s*$/.test(line)) { nodes.push(<hr key={key} />); i += 1; continue; }
    if (line.startsWith('> ')) {
      const content = [];
      while (i < lines.length && lines[i].startsWith('> ')) content.push(lines[i++].slice(2));
      nodes.push(<blockquote key={key}>{renderInline(content.join(' '), key)}</blockquote>); continue;
    }
    const ordered = /^\d+\.\s+/.test(line);
    const unordered = /^[-*+]\s+/.test(line);
    if (ordered || unordered) {
      const items = [];
      while (i < lines.length && (ordered ? /^\d+\.\s+/.test(lines[i]) : /^[-*+]\s+/.test(lines[i]))) {
        const raw = lines[i].replace(ordered ? /^\d+\.\s+/ : /^[-*+]\s+/, '');
        items.push(<li key={i}>{renderInline(raw, `item-${i}`)}</li>);
        i += 1;
      }
      nodes.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>); continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^(?:#{1,4}\s+|```|> |[-*+]\s+|\d+\.\s+|---\s*$)/.test(lines[i])) paragraph.push(lines[i++]);
    if (!paragraph.length) { nodes.push(<p key={key}>{renderInline(lines[i], key)}</p>); i += 1; }
    else nodes.push(<p key={key}>{paragraph.map((part, partIndex) => <Fragment key={partIndex}>{partIndex > 0 ? ' ' : null}{renderInline(part, `${key}-${partIndex}`)}</Fragment>)}</p>);
  }
  return <div className="prose">{nodes}</div>;
}
