import { state } from '../state.js';
import { trackEvent } from '../analytics.js';

export function initFormationSearch() {
    let _searchTimer;
    document.getElementById('formation-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#strat-column .strat-row');
        let resultCount = 0;
        rows.forEach(row => {
            const name = row.querySelector('.strat-name');
            const detail = row.querySelector('.strat-detail');
            const text = ((name ? name.textContent : '') + ' ' + (detail ? detail.textContent : '')).toLowerCase();
            if (!query || text.includes(query)) {
                row.classList.remove('filtered-out');
                resultCount++;
            } else {
                row.classList.add('filtered-out');
            }
        });
        clearTimeout(_searchTimer);
        if (query) {
            _searchTimer = setTimeout(() => {
                trackEvent('search_performed', { query, result_count: resultCount });
            }, 500);
        }
    });
}
