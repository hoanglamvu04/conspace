import { useEffect, useState } from 'react';
import { useNiches } from '../hooks/useResources.js';
import { Icon } from './Icons.jsx';

/**
 * Shared public search controls for Field Notes and Q&A.
 * The parent owns URL query params; this form only submits real filters to API.
 */
export function PublicContentFilters({ kind, q, niche, onApply }) {
  const [draft, setDraft] = useState(q);
  const niches = useNiches();
  useEffect(() => setDraft(q), [q]);
  const options = niches.status === 'success' ? niches.data : [];
  const hasActive = Boolean(q || niche);
  const inputId = kind + '-query';
  const nicheId = kind + '-niche';

  function submit(event) {
    event.preventDefault();
    const nextQuery = draft.trim();
    if (nextQuery.length === 1 || nextQuery.length > 100) return;
    onApply({ q: nextQuery, niche });
  }

  return <form className="public-content-filters" role="search" aria-label={'Lọc ' + (kind === 'field' ? 'Hiện trường' : 'Hỏi đáp')} onSubmit={submit}>
    <div className="public-filter-field public-filter-query">
      <label htmlFor={inputId}>Tìm theo từ khóa</label>
      <div className="public-filter-input">
        <Icon name="search" size={17}/>
        <input id={inputId} type="search" value={draft} minLength={2} maxLength={100}
          placeholder={kind === 'field' ? 'Ví dụ: bản vẽ, bàn giao...' : 'Ví dụ: vật liệu, nội thất...'}
          onChange={(event) => setDraft(event.target.value)} />
      </div>
    </div>
    <div className="public-filter-field public-filter-niche">
      <label htmlFor={nicheId}>Lĩnh vực</label>
      <select id={nicheId} value={niche} onChange={(event) => onApply({ q, niche: event.target.value })}>
        <option value="">Tất cả lĩnh vực</option>
        {niche && !options.some((item) => item.slug === niche) && <option value={niche}>{niche}</option>}
        {options.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
      </select>
    </div>
    <div className="public-filter-actions">
      <button className="button button--primary" type="submit">Tìm kiếm <Icon name="arrow" size={16}/></button>
      {hasActive && <button className="public-filter-clear" type="button" onClick={() => { setDraft(''); onApply({ q:'', niche:'' }); }}>
        <Icon name="close" size={15}/> Xóa bộ lọc
      </button>}
    </div>
    {niches.status === 'error' && <p className="public-filter-notice" role="status">
      Chưa tải được danh sách lĩnh vực. <button type="button" onClick={niches.retry}>Tải lại</button>
    </p>}
  </form>;
}
