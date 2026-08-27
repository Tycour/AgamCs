(function initialiseGeneSearch(root, factory) {
  const api = factory();
  root.AgamCsGeneSearch = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  const DEFAULT_LIMIT = 12;

  class GeneSearchError extends Error {
    constructor(code, message, choices = []) {
      super(message);
      this.name = 'GeneSearchError';
      this.code = code;
      this.choices = choices;
    }
  }

  function normalize(value) {
    return String(value || '').trim().toUpperCase();
  }

  function wordPrefixMatch(value, query) {
    return value.split(/[^A-Z0-9]+/).some((word) => word.startsWith(query));
  }

  function geneCandidate(index, namingIndex, accession, score, matchField) {
    const gene = index.accessions[accession];
    const naming = namingIndex.names?.[accession] || {};
    return {
      value: accession,
      accession,
      geneAccession: accession,
      kind: 'gene',
      name: naming.name || null,
      description: naming.description || null,
      biotype: naming.biotype || null,
      region: gene.region,
      transcriptCount: gene.transcript_ids.length,
      score,
      matchField,
    };
  }

  function transcriptCandidate(index, namingIndex, transcriptId, score) {
    const transcript = index.transcripts[transcriptId];
    const gene = index.accessions[transcript.gene_accession];
    const naming = namingIndex.names?.[transcript.gene_accession] || {};
    return {
      value: transcriptId,
      accession: transcriptId,
      geneAccession: transcript.gene_accession,
      kind: 'transcript',
      name: naming.name || null,
      description: naming.description || null,
      biotype: naming.biotype || null,
      region: `${gene.annotation.chromosome}:${transcript.start}-${transcript.end}`,
      transcriptCount: 1,
      score,
      matchField: 'transcript',
    };
  }

  function search(index, namingIndex, value, limit = DEFAULT_LIMIT) {
    const query = normalize(value);
    if (!query || !index?.accessions || !namingIndex?.names) {
      return { query, matches: [], total: 0, limit: Number(limit) || DEFAULT_LIMIT };
    }
    const maximum = Number.isSafeInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
    const matches = [];

    Object.keys(index.accessions).forEach((accession) => {
      let score = Infinity;
      let matchField = null;
      if (accession === query) {
        score = 0;
        matchField = 'accession';
      } else if (accession.startsWith(query)) {
        score = 10;
        matchField = 'accession';
      }

      const name = namingIndex.names[accession]?.name;
      const normalizedName = normalize(name);
      if (normalizedName) {
        let nameScore = Infinity;
        if (normalizedName === query) nameScore = 20;
        else if (normalizedName.startsWith(query)) nameScore = 30;
        else if (wordPrefixMatch(normalizedName, query)) nameScore = 40;
        else if (normalizedName.includes(query)) nameScore = 50;
        if (nameScore < score) {
          score = nameScore;
          matchField = 'name';
        }
      }

      if (Number.isFinite(score)) {
        matches.push(geneCandidate(index, namingIndex, accession, score, matchField));
      }
    });

    if (query.startsWith('AGAP') && (query.includes('-') || query.includes('.'))) {
      Object.keys(index.transcripts).forEach((transcriptId) => {
        if (transcriptId === query) {
          matches.push(transcriptCandidate(index, namingIndex, transcriptId, 1));
        } else if (transcriptId.startsWith(query)) {
          matches.push(transcriptCandidate(index, namingIndex, transcriptId, 11));
        }
      });
    }

    matches.sort((left, right) => (
      left.score - right.score
      || String(left.name || left.accession).localeCompare(String(right.name || right.accession))
      || left.accession.localeCompare(right.accession)
    ));
    return {
      query,
      matches: matches.slice(0, maximum),
      total: matches.length,
      limit: maximum,
    };
  }

  function canonicalize(index, namingIndex, value) {
    const raw = String(value || '').trim();
    const normalized = normalize(raw);
    if (!normalized) return { value: normalized, matchedAs: 'empty', name: null };
    if (index?.accessions?.[normalized] || index?.transcripts?.[normalized]) {
      return { value: normalized, matchedAs: 'accession', name: null };
    }

    const choices = Object.entries(namingIndex?.names || {})
      .filter(([, record]) => normalize(record.name) === normalized)
      .map(([accession]) => accession)
      .sort();
    if (choices.length === 1) {
      return { value: choices[0], matchedAs: 'name', name: raw };
    }
    if (choices.length > 1) {
      throw new GeneSearchError(
        'ambiguous-name',
        `${raw} names ${choices.length} genes in ${namingIndex.source?.release || 'the naming index'}: ${choices.join(', ')}. Choose one from the suggestions.`,
        choices,
      );
    }
    return { value: normalized, matchedAs: 'unknown', name: null };
  }

  return { DEFAULT_LIMIT, GeneSearchError, canonicalize, normalize, search };
}));
