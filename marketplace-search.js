// Search approved public listings only. Store order reflects search relevance, not ratings.
(function () {
    const aliases = { eguzi: 'egusi', egussi: 'egusi', egusi: 'egusi', bolo: 'cake', gateau: 'cake', tarta: 'cake', anniversaire: 'birthday', aniversario: 'birthday', cumpleanos: 'birthday' };
    const stopWords = new Set(['with', 'and', 'the', 'for', 'a', 'an', 'of', 'with', 'com', 'e', 'de', 'avec', 'et', 'con', 'y', 'd']);
    function words(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
            .map(word => aliases[word] || (word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word));
    }
    function oneTypo(a, b) {
        if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
        let i = 0, j = 0, edits = 0;
        while (i < a.length && j < b.length) {
            if (a[i] === b[j]) { i++; j++; continue; }
            if (++edits > 1) return false;
            if (a.length >= b.length) i++;
            if (b.length >= a.length) j++;
        }
        return edits + (i < a.length || j < b.length ? 1 : 0) <= 1;
    }
    function rankProducts(products, query) {
        const terms = [...new Set(words(String(query || '').slice(0, 120)).filter(word => !stopWords.has(word)))];
        return products.map((product, index) => {
            const fields = [[product.name, 10], [product.seller_name, 7], [product.description, 3], [product.category, 1]].map(([value, weight]) => [words(value), weight]);
            let score = 0;
            for (const term of terms) {
                let best = 0;
                for (const [tokens, weight] of fields) for (const token of tokens) {
                    if (term === token) best = Math.max(best, weight);
                    else if (term.length >= 3 && token.startsWith(term)) best = Math.max(best, weight * .8);
                    else if (oneTypo(term, token)) best = Math.max(best, weight * .5);
                }
                if (!best) return null;
                score += best;
            }
            return { product, score, index };
        }).filter(Boolean).sort((a, b) => b.score - a.score || a.index - b.index);
    }
    function groupSellers(ranked) {
        const groups = new Map();
        for (const { product, score } of ranked) {
            // Email is an internal fallback only; never put it in a link or result label.
            const key = product.seller_id || product.seller_email || product.id;
            if (!groups.has(key)) groups.set(key, { id: product.seller_id || product.id, name: product.seller_name || 'AfroMkt Seller', products: [], score: 0 });
            const group = groups.get(key);
            group.products.push(product);
            group.score = Math.max(group.score, score);
        }
        return [...groups.values()].sort((a, b) => b.score - a.score || b.products.length - a.products.length);
    }
    function getStoreProducts(products, id) {
        const published = products.filter(product => product.is_active !== false && product.is_approved !== false);
        const owner = published.find(product => product.seller_id === id || product.id === id);
        if (!owner) return [];
        return published.filter(product => owner.seller_id ? product.seller_id === owner.seller_id : owner.seller_email ? product.seller_email === owner.seller_email : product.id === owner.id);
    }
    window.AFRO_MKT_SEARCH = { rankProducts, groupSellers, getStoreProducts };
})();
