(function initialiseAgamCsPlotModel(root, factory) {
  const api = factory();
  root.AgamCsPlotModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  function validateContract(contract) {
    if (contract?.schema_version !== 1 || contract.contract_id !== 'agamcs-plot-contract-v1') {
      throw new Error('The plot contract is missing or incompatible.');
    }
    if (contract.binning?.heatmap_maximum_bins !== 500
        || contract.binning?.signal_maximum_bins !== 240) {
      throw new Error('The plot contract has unexpected display-bin limits.');
    }
    if (!Array.isArray(contract.palette?.viridis_anchors)
        || contract.palette.viridis_anchors.length < 2) {
      throw new Error('The plot contract has no usable identity palette.');
    }
    return contract;
  }

  function mean(values) {
    let total = 0;
    let count = 0;
    for (const value of values) {
      if (Number.isFinite(value)) {
        total += value;
        count += 1;
      }
    }
    return count ? total / count : Number.NaN;
  }

  function quantile(values, proportion) {
    const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
    if (!sorted.length) return Number.NaN;
    const position = (sorted.length - 1) * proportion;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  function annotationMatches(result, annotation) {
    return Boolean(
      annotation
      && String(annotation.chromosome) === String(result.chromosome)
      && Number(annotation.start) >= result.start
      && Number(annotation.end) <= result.end
    );
  }


  function transcriptAnnotationsForDisplay(displayAnnotation, annotations = null) {
    if (!displayAnnotation) return [];
    const candidates = annotations || [displayAnnotation];
    const unique = new Map();
    candidates.forEach((annotation) => {
      if (!annotation?.transcript_id) return;
      if (String(annotation.chromosome) !== String(displayAnnotation.chromosome)) return;
      if (Number(annotation.strand) !== Number(displayAnnotation.strand)) return;
      if (Number(annotation.end) < Number(displayAnnotation.start)
          || Number(annotation.start) > Number(displayAnnotation.end)) return;
      if (!Array.isArray(annotation.exons) || !annotation.exons.length) return;
      unique.set(String(annotation.transcript_id), annotation);
    });
    if (!unique.size && displayAnnotation.transcript_id) {
      unique.set(String(displayAnnotation.transcript_id), displayAnnotation);
    }
    return [...unique.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([_key, annotation]) => annotation);
  }

  function coordinateRecords(result, annotation = null) {
    const useAnnotation = annotationMatches(result, annotation);
    const mapper = useAnnotation
      ? (Number(annotation.strand) === -1
        ? (position) => Number(annotation.end) - position
        : (position) => position - Number(annotation.start))
      : (position) => position - result.start;
    const records = Array.from({ length: result.values.Cs.length }, (_, index) => {
      const position = result.start + index;
      return {
        index,
        position,
        x: mapper(position),
        Cs: Number(result.values.Cs[index]),
        snp: Number(result.values.snp_density[index]),
        status: Number(result.values.status[index]),
      };
    });
    records.sort((left, right) => left.x - right.x);
    return { records, annotation: useAnnotation ? annotation : null };
  }

  function assignBins(records, maximumBins) {
    if (!records.length) throw new Error('The plot model requires at least one record.');
    const binCount = Math.min(Math.max(1, Number(maximumBins)), records.length);
    const minimum = records[0].x;
    const maximum = records[records.length - 1].x;
    const span = maximum - minimum;
    const bins = Array.from({ length: binCount }, () => []);
    records.forEach((record) => {
      const index = span === 0
        ? 0
        : Math.min(binCount - 1, Math.floor((record.x - minimum) * binCount / span));
      bins[index].push(record);
    });
    return { bins: bins.filter((bin) => bin.length), minimum, maximum, span, binCount };
  }

  function summarizeSignals(result, annotation, contract) {
    const mapped = coordinateRecords(result, annotation);
    const assigned = assignBins(mapped.records, contract.binning.signal_maximum_bins);
    const cs = assigned.bins.map((bin) => {
      const values = bin.map((record) => record.Cs);
      return {
        position: mean(bin.map((record) => record.x)),
        mean: mean(values),
        q10: quantile(values, 0.10),
        q25: quantile(values, 0.25),
        median: quantile(values, 0.50),
        q75: quantile(values, 0.75),
        q90: quantile(values, 0.90),
      };
    });
    const snp = assigned.bins.map((bin) => {
      const accessible = bin.filter((record) => (record.status & 1) === 1);
      return {
        position: mean(bin.map((record) => record.x)),
        mean: mean(accessible.map((record) => record.snp)),
        accessibleFraction: accessible.length / bin.length,
      };
    });
    return { ...mapped, ...assigned, cs, snp };
  }

  function summarizeHeatmap(result, annotation, contract) {
    const mapped = coordinateRecords(result, annotation);
    const assigned = assignBins(mapped.records, contract.binning.heatmap_maximum_bins);
    const rowCount = result.stackRows.length;
    const sourceWidth = result.values.Cs.length;
    const cells = Array.from({ length: rowCount }, () => []);
    for (let row = 0; row < rowCount; row += 1) {
      for (const bin of assigned.bins) {
        let detected = 0;
        let totalIdentity = 0;
        for (const record of bin) {
          const value = Number(result.values.stack[row * sourceWidth + record.index]);
          if (value !== 0 && Number.isFinite(value)) {
            detected += 1;
            totalIdentity += value;
          }
        }
        cells[row].push({
          identity: detected ? totalIdentity / detected : 0,
          detectedFraction: detected / bin.length,
          genomicStart: Math.min(...bin.map((record) => record.position)),
          genomicEnd: Math.max(...bin.map((record) => record.position)),
        });
      }
    }
    return { ...mapped, ...assigned, cells };
  }

  function interpolateIdentityColor(identity, contract) {
    const bounded = Math.max(0, Math.min(1, Number(identity) / 100));
    const anchors = contract.palette.viridis_anchors;
    let lower = anchors[0];
    let upper = anchors[anchors.length - 1];
    for (let index = 1; index < anchors.length; index += 1) {
      if (bounded <= anchors[index][0]) {
        lower = anchors[index - 1];
        upper = anchors[index];
        break;
      }
    }
    const fraction = (bounded - lower[0]) / (upper[0] - lower[0] || 1);
    return lower[1].map((channel, index) => (
      Math.round(channel + (upper[1][index] - channel) * fraction)
    ));
  }

  function blendedIdentityRgb(identity, detectedFraction, contract) {
    if (!detectedFraction) return [...contract.palette.no_interval_rgb];
    const identityRgb = interpolateIdentityColor(identity, contract);
    const background = contract.palette.no_interval_rgb;
    const strength = 0.35 + Number(detectedFraction) * 0.65;
    return identityRgb.map((channel, index) => (
      Math.round(background[index] + (channel - background[index]) * strength)
    ));
  }

  function blendedIdentityColor(identity, detectedFraction, contract) {
    return `rgb(${blendedIdentityRgb(identity, detectedFraction, contract).join(',')})`;
  }

  function heatmapGeometry(rowCount, binCount, contract, annotationCount = 0) {
    const layout = contract.heatmap_layout;
    const plotWidth = layout.plot_right - layout.plot_left;
    const plotHeight = Number(rowCount) * layout.row_height;
    const footer = annotationCount > 1
      ? Math.max(
        layout.footer_single_annotation,
        layout.footer_multi_annotation_base + annotationCount * layout.transcript_row_height,
      )
      : annotationCount === 1
        ? layout.footer_single_annotation
        : layout.footer_without_annotation;
    return {
      width: layout.width,
      height: layout.row_top + plotHeight + footer,
      plotLeft: layout.plot_left,
      plotRight: layout.plot_right,
      plotWidth,
      plotHeight,
      rowTop: layout.row_top,
      rowHeight: layout.row_height,
      cellWidth: plotWidth / Number(binCount),
    };
  }

  function finiteOrNull(value) {
    return Number.isFinite(value) ? value : null;
  }

  function buildPlotModel(result, annotation, transcriptAnnotations, contract) {
    validateContract(contract);
    const signal = summarizeSignals(result, annotation, contract);
    const heatmap = summarizeHeatmap(result, annotation, contract);
    const annotationModels = transcriptAnnotationsForDisplay(
      signal.annotation, transcriptAnnotations,
    );
    const normalizeRecords = (records) => records.map((record) => record.index);
    return {
      schemaVersion: contract.schema_version,
      contractId: contract.contract_id,
      chromosome: result.chromosome,
      start: result.start,
      end: result.end,
      annotationApplied: Boolean(signal.annotation),
      signal: {
        minimum: signal.minimum,
        maximum: signal.maximum,
        binCount: signal.binCount,
        bins: signal.bins.map(normalizeRecords),
        cs: signal.cs.map((record) => Object.fromEntries(
          Object.entries(record).map(([key, value]) => [key, finiteOrNull(value)]),
        )),
        snp: signal.snp.map((record) => ({
          position: finiteOrNull(record.position),
          mean: finiteOrNull(record.mean),
          accessibleFraction: record.accessibleFraction,
        })),
      },
      heatmap: {
        minimum: heatmap.minimum,
        maximum: heatmap.maximum,
        binCount: heatmap.binCount,
        bins: heatmap.bins.map(normalizeRecords),
        cells: heatmap.cells,
      },
      rendering: {
        geometry: heatmapGeometry(
          result.stackRows.length,
          heatmap.binCount,
          contract,
          annotationModels.length,
        ),
      },
    };
  }

  return {
    annotationMatches,
    blendedIdentityColor,
    buildPlotModel,
    heatmapGeometry,
    mean,
    quantile,
    summarizeHeatmap,
    summarizeSignals,
    transcriptAnnotationsForDisplay,
    validateContract,
  };
}));
