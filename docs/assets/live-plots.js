(function initialiseAgamCsPlots(global) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const COLORS = {
    ink: '#172925',
    muted: '#5d6b67',
    grid: '#d9ded8',
    cs: '#175a9e',
    csMid: '#4292c6',
    csOuter: '#9ecae1',
    snp: '#238b45',
    unknown: '#969696',
    cds: '#2171b5',
    cdsEdge: '#084594',
    utr: '#deebf7',
    intron: '#4d4d4d',
    link: '#0c675a',
  };
  const CLADE_COLORS = ['#3f007d', '#8c2981', '#cc4678', '#d95f0e'];
  const CLADE_NAMES = ['gambiae complex', 'Other Anopheles', 'New World', 'Outgroups'];
  const CLADE_RANGES = [[0, 4], [5, 15], [16, 17], [18, 20]];
  const GENUS_ABBREVIATIONS = new Map([
    ['Anopheles', 'An.'],
    ['Aedes', 'Ae.'],
    ['Culex', 'Cx.'],
    ['Drosophila', 'D.'],
  ]);
  const plotModel = global.AgamCsPlotModel;
  if (!plotModel) throw new Error('AgamCsPlotModel must load before live-plots.js.');
  let plotContract = null;

  function configurePlotContract(contract) {
    plotContract = plotModel.validateContract(contract);
    return plotContract;
  }

  function requirePlotContract() {
    if (!plotContract) throw new Error('Configure the versioned plot contract before plotting.');
    return plotContract;
  }

  const annotationMatches = plotModel.annotationMatches;
  const mean = plotModel.mean;
  const quantile = plotModel.quantile;
  const transcriptAnnotationsForDisplay = plotModel.transcriptAnnotationsForDisplay;

  function summarizeQuery(result, annotation = null) {
    const useAnnotation = annotationMatches(result, annotation)
      && Array.isArray(annotation.exons)
      && annotation.exons.length > 0;
    const queryCs = [];
    const querySnp = [];
    const exonCs = [];
    const exonSnp = [];
    let exonBasePairs = 0;

    for (let index = 0; index < result.values.Cs.length; index += 1) {
      const position = result.start + index;
      const accessible = (result.values.status[index] & 1) === 1;
      queryCs.push(result.values.Cs[index]);
      if (accessible) querySnp.push(result.values.snp_density[index]);

      const inExon = useAnnotation && annotation.exons.some((exon) => (
        position >= Number(exon.start) && position <= Number(exon.end)
      ));
      if (!inExon) continue;
      exonBasePairs += 1;
      exonCs.push(result.values.Cs[index]);
      if (accessible) exonSnp.push(result.values.snp_density[index]);
    }

    return {
      queryBasePairs: result.values.Cs.length,
      queryMeanCs: mean(queryCs),
      queryMeanSnp: mean(querySnp),
      exonBasePairs: useAnnotation ? exonBasePairs : null,
      exonMeanCs: useAnnotation ? mean(exonCs) : Number.NaN,
      exonMeanSnp: useAnnotation ? mean(exonSnp) : Number.NaN,
    };
  }

  function summarizeSignals(
    result, annotation = null, resolution = 'adaptive', displayRange = null,
  ) {
    return plotModel.summarizeSignals(
      result, annotation, requirePlotContract(), resolution, displayRange,
    );
  }

  function summarizeHeatmap(
    result, annotation = null, resolution = 'adaptive', displayRange = null,
  ) {
    return plotModel.summarizeHeatmap(
      result, annotation, requirePlotContract(), resolution, displayRange,
    );
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function addText(parent, text, x, y, attributes = {}) {
    const element = svgElement('text', { x, y, ...attributes });
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function vectorBaseGeneUrl(geneId) {
    const normalized = String(geneId || '').trim();
    return normalized
      ? `https://vectorbase.org/vectorbase/app/record/gene/${encodeURIComponent(normalized)}`
      : null;
  }

  function addTranscriptLink(parent, geneId, transcriptId, text, x, y, attributes = {}) {
    const href = vectorBaseGeneUrl(geneId);
    if (!href) return addText(parent, text, x, y, attributes);
    const link = svgElement('a', {
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
      class: 'annotation-record-link',
      'aria-label': `View VectorBase gene ${geneId} for transcript ${transcriptId} (opens in a new tab)`,
      style: 'cursor: pointer',
    });
    const title = svgElement('title');
    title.textContent = `View VectorBase gene ${geneId} for transcript ${transcriptId}`;
    link.append(title);
    addText(link, text, x, y, {
      ...attributes,
      fill: COLORS.link,
      'text-decoration': 'underline',
    });
    parent.append(link);
    return link;
  }

  function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
    const span = domainMax - domainMin;
    return (value) => span === 0
      ? (rangeMin + rangeMax) / 2
      : rangeMin + (value - domainMin) / span * (rangeMax - rangeMin);
  }

  function linePath(points, xValue, yValue) {
    let path = '';
    let drawing = false;
    for (const point of points) {
      const x = xValue(point);
      const y = yValue(point);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        drawing = false;
        continue;
      }
      path += `${drawing ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
      drawing = true;
    }
    return path;
  }

  function areaPath(points, xValue, upperValue, lowerValue) {
    const valid = points.filter((point) => (
      Number.isFinite(xValue(point))
      && Number.isFinite(upperValue(point))
      && Number.isFinite(lowerValue(point))
    ));
    if (!valid.length) return '';
    const upper = valid.map((point, index) => (
      `${index ? 'L' : 'M'}${xValue(point).toFixed(2)},${upperValue(point).toFixed(2)}`
    )).join('');
    const lower = [...valid].reverse().map((point) => (
      `L${xValue(point).toFixed(2)},${lowerValue(point).toFixed(2)}`
    )).join('');
    return `${upper}${lower}Z`;
  }

  function drawYAxis(svg, x, top, height, label) {
    for (const value of [0, 0.25, 0.5, 0.75, 1]) {
      const y = top + height - value * height;
      svg.append(svgElement('line', {
        x1: x, x2: 976, y1: y, y2: y,
        stroke: COLORS.grid, 'stroke-width': 1,
      }));
      addText(svg, value.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''), x - 10, y + 4, {
        'text-anchor': 'end', fill: COLORS.muted, 'font-size': 12,
      });
    }
    addText(svg, label, 19, top + height / 2, {
      transform: `rotate(-90 19 ${top + height / 2})`,
      'text-anchor': 'middle', fill: COLORS.ink, 'font-size': 13, 'font-weight': 650,
    });
  }

  function addLegendItem(svg, x, y, label, style) {
    if (style.line) {
      svg.append(svgElement('line', {
        x1: x, x2: x + 24, y1: y - 4, y2: y - 4,
        stroke: style.color, 'stroke-width': style.width || 3,
        'stroke-dasharray': style.dash || '',
      }));
    } else {
      svg.append(svgElement('rect', {
        x, y: y - 12, width: 24, height: 12,
        fill: style.color, opacity: style.opacity || 1,
        stroke: style.stroke || 'none',
      }));
    }
    addText(svg, label, x + 31, y, { fill: COLORS.muted, 'font-size': 12 });
  }

  function cdsSegments(annotation) {
    return transcriptModelGeometry(annotation, annotation).cds;
  }

  function transcriptModelGeometry(annotation, displayAnnotation, genomicRange = null) {
    if (!annotation || !displayAnnotation) return { transcript: null, exons: [], cds: [] };
    const displayStart = Number(displayAnnotation.start);
    const displayEnd = Number(displayAnnotation.end);
    const clipStart = Number(genomicRange?.start ?? displayStart);
    const clipEnd = Number(genomicRange?.end ?? displayEnd);
    const mapper = Number(displayAnnotation.strand) === -1
      ? (position) => displayEnd - position
      : (position) => position - displayStart;
    const mappedInterval = (startValue, endValue) => {
      const start = Math.max(Number(startValue), clipStart);
      const end = Math.min(Number(endValue), clipEnd);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
      return [Math.min(mapper(start), mapper(end)), Math.max(mapper(start), mapper(end))];
    };
    const transcript = mappedInterval(annotation.start, annotation.end);
    const exons = (annotation.exons || [])
      .map((exon) => mappedInterval(exon.start, exon.end))
      .filter(Boolean)
      .sort((left, right) => left[0] - right[0]);
    const cds = annotation.cds_start == null || annotation.cds_end == null
      ? []
      : (annotation.exons || []).map((exon) => {
        const start = Math.max(Number(exon.start), Number(annotation.cds_start));
        const end = Math.min(Number(exon.end), Number(annotation.cds_end));
        return start <= end ? mappedInterval(start, end) : null;
      }).filter(Boolean).sort((left, right) => left[0] - right[0]);
    return { transcript, exons, cds };
  }

  function clipMappedInterval(interval, minimum, maximum) {
    const left = Math.max(Number(interval[0]), minimum);
    const right = Math.min(Number(interval[1]), maximum);
    return left <= right ? [left, right] : null;
  }

  function drawCdsStrip(svg, annotation, xScale, y, xMinimum, xMaximum) {
    cdsSegments(annotation)
      .map((interval) => clipMappedInterval(interval, xMinimum, xMaximum))
      .filter(Boolean)
      .forEach(([left, right]) => {
        svg.append(svgElement('rect', {
          x: xScale(left), y,
          width: Math.max(1, xScale(right) - xScale(left)), height: 8,
          fill: COLORS.cds, stroke: COLORS.cdsEdge, 'stroke-width': 1,
          class: 'heatmap-cds-strip',
        }));
      });
  }

  function drawGeneModel(svg, annotation, xScale, y, xMinimum, xMaximum, layout = {}) {
    if (!annotation) return;
    const mapper = Number(annotation.strand) === -1
      ? (position) => Number(annotation.end) - position
      : (position) => position - Number(annotation.start);
    const exons = (annotation.exons || []).map((exon) => {
      const interval = clipMappedInterval([
        Math.min(mapper(Number(exon.start)), mapper(Number(exon.end))),
        Math.max(mapper(Number(exon.start)), mapper(Number(exon.end))),
      ], xMinimum, xMaximum);
      return interval ? { left: interval[0], right: interval[1], exon } : null;
    }).filter(Boolean).sort((left, right) => left.left - right.left);

    const transcript = clipMappedInterval(
      [0, Number(annotation.end) - Number(annotation.start)], xMinimum, xMaximum,
    );
    if (transcript) {
      svg.append(svgElement('line', {
        x1: xScale(transcript[0]), x2: xScale(transcript[1]),
        y1: y, y2: y, stroke: COLORS.intron, 'stroke-width': 2,
      }));
    }
    exons.forEach(({ left, right }) => {
      svg.append(svgElement('rect', {
        x: xScale(left), y: y - 7,
        width: Math.max(1, xScale(right) - xScale(left)), height: 14,
        fill: COLORS.utr, stroke: COLORS.cds, 'stroke-width': 1,
      }));
    });
    cdsSegments(annotation)
      .map((interval) => clipMappedInterval(interval, xMinimum, xMaximum))
      .filter(Boolean)
      .forEach(([left, right]) => {
        svg.append(svgElement('rect', {
          x: xScale(left), y: y - 11,
          width: Math.max(1, xScale(right) - xScale(left)), height: 22,
          fill: COLORS.cds, stroke: COLORS.cdsEdge, 'stroke-width': 1,
        }));
      });

    const strand = Number(annotation.strand) === -1 ? '−' : '+';
    const labelLeft = layout.labelLeft || 86;
    const centre = layout.centre || 531;
    const legendLeft = layout.legendLeft || 730;
    const transcriptId = annotation.transcript_id;
    addTranscriptLink(
      svg,
      annotation.id,
      transcriptId,
      `${transcriptId || annotation.id} (${strand} strand; shown 5′→3′)`,
      labelLeft,
      y + 34,
      { 'font-size': 13, 'font-weight': 650 },
    );
    addLegendItem(svg, legendLeft, y + 34, annotation.cds_start == null ? 'Exon' : 'UTR', {
      color: COLORS.utr, stroke: COLORS.cds,
    });
    if (annotation.cds_start != null) {
      addLegendItem(svg, legendLeft + 108, y + 34, 'CDS', { color: COLORS.cds, stroke: COLORS.cdsEdge });
    }

    const allExons = annotation.exons || [];
    const selected = allExons.length > 8
      ? new Set(Array.from({ length: 8 }, (_, index) => Math.round(index * (allExons.length - 1) / 7)))
      : new Set(allExons.map((_, index) => index));
    const landmarks = new Map();
    allExons.forEach((exon, index) => {
      if (!selected.has(index)) return;
      const genomic = Number(annotation.strand) === -1 ? Number(exon.end) : Number(exon.start);
      landmarks.set(mapper(genomic), `E${index + 1}`);
    });
    landmarks.set(0, 'TSS / E1');
    landmarks.set(Number(annotation.end) - Number(annotation.start), 'TES');
    const visibleLandmarks = [...landmarks.entries()]
      .sort((left, right) => left[0] - right[0])
      .filter(([position]) => position >= xMinimum && position <= xMaximum);
    const rowRightEdges = [];
    visibleLandmarks.forEach(([position, label], index) => {
      if (position < xMinimum || position > xMaximum) return;
      const x = xScale(position);
      const text = `${label}  ${Math.round(position).toLocaleString()}`;
      const alignment = index === 0 ? 'start' : index === visibleLandmarks.length - 1 ? 'end' : 'middle';
      const estimatedWidth = text.length * 5.8;
      const left = alignment === 'start' ? x : alignment === 'end' ? x - estimatedWidth : x - estimatedWidth / 2;
      const right = alignment === 'start' ? x + estimatedWidth : alignment === 'end' ? x : x + estimatedWidth / 2;
      let row = rowRightEdges.findIndex((previousRight) => left >= previousRight + 8);
      if (row === -1) {
        row = rowRightEdges.length;
        rowRightEdges.push(right);
      } else {
        rowRightEdges[row] = right;
      }
      svg.append(svgElement('line', {
        x1: x, x2: x, y1: y + 13, y2: y + 18,
        stroke: COLORS.muted, 'stroke-width': 1,
      }));
      addText(svg, text, x, y + 55 + row * 18, {
        'text-anchor': alignment,
        fill: COLORS.muted, 'font-size': 10,
      });
    });
    addText(svg, `Position relative to ${annotation.id} transcription start (bp)`, centre, y + 76 + rowRightEdges.length * 18, {
      'text-anchor': 'middle', fill: COLORS.ink, 'font-size': 12,
    });
  }

  function drawTranscriptModels(
    svg, displayAnnotation, annotations, xScale, y, xMinimum, xMaximum, layout = {},
  ) {
    const models = transcriptAnnotationsForDisplay(displayAnnotation, annotations, {
      genomicRange: layout.filterRange || layout.genomicRange,
      includeOppositeStrands: Boolean(layout.includeOppositeStrands),
      sortByPosition: Boolean(layout.sortByPosition),
    });
    if (!models.length) return y;
    const rowHeight = layout.rowHeight || 24;
    const labelX = layout.labelX ?? xScale(xMinimum) - 8;
    const titleX = layout.titleX ?? xScale(xMinimum);
    const centre = layout.centre ?? (xScale(xMinimum) + xScale(xMaximum)) / 2;
    const legendLeft = layout.legendLeft ?? xScale(xMaximum) - 235;
    const selectedTranscriptId = layout.selectedTranscriptId || displayAnnotation.transcript_id;
    const rowStart = y + 34;

    addText(svg, layout.title || `Transcript models (${models.length}; selected/representative in bold)`, titleX, y, {
      fill: COLORS.ink, 'font-size': 12, 'font-weight': 700,
    });
    addLegendItem(svg, legendLeft, y, 'UTR', { color: COLORS.utr, stroke: COLORS.cds });
    addLegendItem(svg, legendLeft + 100, y, 'CDS', { color: COLORS.cds, stroke: COLORS.cdsEdge });

    models.forEach((annotation, index) => {
      const rowY = rowStart + index * rowHeight;
      const selected = annotation.transcript_id === selectedTranscriptId;
      const geometry = transcriptModelGeometry(
        annotation, displayAnnotation, layout.genomicRange,
      );
      const transcript = geometry.transcript
        ? clipMappedInterval(geometry.transcript, xMinimum, xMaximum)
        : null;
      const exons = geometry.exons
        .map((interval) => clipMappedInterval(interval, xMinimum, xMaximum))
        .filter(Boolean);
      const cds = geometry.cds
        .map((interval) => clipMappedInterval(interval, xMinimum, xMaximum))
        .filter(Boolean);
      const group = svgElement('g', {
        class: `transcript-model-row${selected ? ' selected-transcript-model' : ''}`,
        'data-transcript-id': annotation.transcript_id,
      });
      const strand = Number(annotation.strand) === -1 ? '−' : '+';
      addTranscriptLink(group, annotation.id, annotation.transcript_id, `${annotation.transcript_id} ${strand}`, labelX, rowY + 4, {
        'text-anchor': 'end', 'font-size': 9,
        'font-weight': selected ? 800 : 500,
      });
      if (transcript) {
        group.append(svgElement('line', {
          x1: xScale(transcript[0]), x2: xScale(transcript[1]),
          y1: rowY, y2: rowY, stroke: COLORS.intron,
          'stroke-width': selected ? 2 : 1.4,
        }));
      }
      exons.forEach(([left, right]) => {
        group.append(svgElement('rect', {
          x: xScale(left), y: rowY - 5,
          width: Math.max(1, xScale(right) - xScale(left)), height: 10,
          fill: COLORS.utr, stroke: COLORS.cds, 'stroke-width': selected ? 1.2 : 0.8,
        }));
      });
      cds.forEach(([left, right]) => {
        group.append(svgElement('rect', {
          x: xScale(left), y: rowY - 8,
          width: Math.max(1, xScale(right) - xScale(left)), height: 16,
          fill: COLORS.cds, stroke: COLORS.cdsEdge, 'stroke-width': selected ? 1.2 : 0.8,
        }));
      });
      svg.append(group);
    });

    const axisY = rowStart + models.length * rowHeight + 8;
    for (let index = 0; index <= 6; index += 1) {
      const value = xMinimum + (xMaximum - xMinimum) * index / 6;
      const x = xScale(value);
      svg.append(svgElement('line', {
        x1: x, x2: x, y1: axisY, y2: axisY + 5, stroke: COLORS.muted,
      }));
      addText(svg, Math.round(value).toLocaleString(), x, axisY + 20, {
        'text-anchor': index === 0 ? 'start' : index === 6 ? 'end' : 'middle',
        fill: COLORS.muted, 'font-size': 10,
      });
    }
    svg.append(svgElement('line', {
      x1: xScale(xMinimum), x2: xScale(xMaximum), y1: axisY, y2: axisY,
      stroke: COLORS.muted, 'stroke-width': 1,
    }));
    addText(svg, layout.axisLabel || `Position relative to ${displayAnnotation.id} transcription start (bp)`, centre, axisY + 44, {
      'text-anchor': 'middle', fill: COLORS.ink, 'font-size': 12,
    });
    return axisY + 58;
  }

  function drawXAxis(svg, xScale, minimum, maximum, y, label) {
    for (let index = 0; index <= 6; index += 1) {
      const value = minimum + (maximum - minimum) * index / 6;
      const x = xScale(value);
      svg.append(svgElement('line', { x1: x, x2: x, y1: y, y2: y + 5, stroke: COLORS.muted }));
      addText(svg, Math.round(value).toLocaleString(), x, y + 20, {
        'text-anchor': index === 0 ? 'start' : index === 6 ? 'end' : 'middle',
        fill: COLORS.muted, 'font-size': 11,
      });
    }
    addText(svg, label, 531, y + 47, { 'text-anchor': 'middle', fill: COLORS.ink, 'font-size': 12 });
  }

  function inaccessibleRuns(records) {
    const runs = [];
    let start = null;
    records.forEach((record, index) => {
      const inaccessible = (record.status & 1) !== 1;
      if (inaccessible && start == null) start = index;
      if (start != null && (!inaccessible || index === records.length - 1)) {
        runs.push([start, inaccessible && index === records.length - 1 ? index : index - 1]);
        start = null;
      }
    });
    return runs;
  }

  function rangeFromDisplayBins(summary, firstFraction, secondFraction) {
    if (!summary?.bins?.length) throw new Error('A displayed plot range requires bins.');
    const bounded = (value) => Math.max(0, Math.min(1, Number(value)));
    const lowerFraction = Math.min(bounded(firstFraction), bounded(secondFraction));
    const upperFraction = Math.max(bounded(firstFraction), bounded(secondFraction));
    const lastIndex = summary.bins.length - 1;
    const lowerIndex = Math.min(lastIndex, Math.floor(lowerFraction * summary.bins.length));
    const upperIndex = Math.min(lastIndex, Math.floor(upperFraction * summary.bins.length));
    let start = Number.POSITIVE_INFINITY;
    let end = Number.NEGATIVE_INFINITY;
    for (let index = lowerIndex; index <= upperIndex; index += 1) {
      summary.bins[index].forEach((record) => {
        start = Math.min(start, record.position);
        end = Math.max(end, record.position);
      });
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error('The selected display bins contain no genomic positions.');
    }
    return { start, end };
  }

  function installPlotRangeSelector(
    svg, summary, plotLeft, plotWidth, plotTop, plotBottom, options = null,
  ) {
    if (!options?.onSelect) return;
    const selection = svgElement('rect', {
      class: 'plot-range-selection',
      x: plotLeft,
      y: plotTop,
      width: 0,
      height: plotBottom - plotTop,
      opacity: 0,
      'pointer-events': 'none',
      'aria-hidden': 'true',
    });
    svg.append(selection);
    let startX = null;
    let pointerId = null;
    const viewX = (event) => {
      const bounds = svg.getBoundingClientRect();
      const viewWidth = Number(svg.getAttribute('viewBox').split(' ')[2]);
      return (event.clientX - bounds.left) / bounds.width * viewWidth;
    };
    const boundedX = (x) => Math.max(plotLeft, Math.min(plotLeft + plotWidth, x));
    const updateSelection = (currentX) => {
      const left = Math.min(startX, currentX);
      const right = Math.max(startX, currentX);
      selection.setAttribute('x', left);
      selection.setAttribute('width', right - left);
      selection.setAttribute('opacity', 0.24);
    };
    const clearSelection = () => {
      startX = null;
      pointerId = null;
      selection.setAttribute('opacity', 0);
      selection.setAttribute('width', 0);
    };
    svg.addEventListener('pointerdown', (event) => {
      if (options.isEnabled && !options.isEnabled()) return;
      const x = viewX(event);
      if (x < plotLeft || x > plotLeft + plotWidth) return;
      event.preventDefault?.();
      startX = boundedX(x);
      pointerId = event.pointerId;
      if (pointerId != null) svg.setPointerCapture?.(pointerId);
      updateSelection(startX);
    });
    svg.addEventListener('pointermove', (event) => {
      if (startX == null || (pointerId != null && event.pointerId !== pointerId)) return;
      updateSelection(boundedX(viewX(event)));
    });
    svg.addEventListener('pointerup', (event) => {
      if (startX == null || (pointerId != null && event.pointerId !== pointerId)) return;
      const endX = boundedX(viewX(event));
      if (pointerId != null) svg.releasePointerCapture?.(pointerId);
      if (Math.abs(endX - startX) >= 4) {
        const range = rangeFromDisplayBins(
          summary,
          (startX - plotLeft) / plotWidth,
          (endX - plotLeft) / plotWidth,
        );
        clearSelection();
        options.onSelect(range);
        return;
      }
      clearSelection();
    });
    svg.addEventListener('pointercancel', clearSelection);
  }

  function installSignalTooltip(container, svg, summary, xScale, plotLeft, plotWidth, plotTop, plotBottom) {
    const tooltip = document.createElement('div');
    tooltip.className = 'live-tooltip';
    tooltip.hidden = true;
    container.append(tooltip);
    const crosshair = svgElement('line', {
      y1: plotTop, y2: plotBottom, stroke: COLORS.ink,
      'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0,
    });
    svg.append(crosshair);
    svg.addEventListener('pointermove', (event) => {
      const bounds = svg.getBoundingClientRect();
      const viewX = (event.clientX - bounds.left) / bounds.width * 1000;
      if (viewX < plotLeft || viewX > plotLeft + plotWidth) {
        tooltip.hidden = true;
        crosshair.setAttribute('opacity', 0);
        return;
      }
      const fraction = (viewX - plotLeft) / plotWidth;
      const index = Math.max(0, Math.min(summary.records.length - 1, Math.round(fraction * (summary.records.length - 1))));
      const record = summary.records[index];
      crosshair.setAttribute('x1', xScale(record.x));
      crosshair.setAttribute('x2', xScale(record.x));
      crosshair.setAttribute('opacity', 0.65);
      tooltip.innerHTML = `<strong>${record.position.toLocaleString()}</strong><span>Cs ${record.Cs.toPrecision(5)}</span><span>Raw SNP ${record.snp.toPrecision(5)}</span><span>${(record.status & 1) === 1 ? 'Accessible / PASS' : 'Unknown / QC failed'}</span>`;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.min(bounds.width - 175, Math.max(8, event.clientX - bounds.left + 12))}px`;
      tooltip.style.top = `${Math.max(8, event.clientY - bounds.top - 58)}px`;
    });
    svg.addEventListener('pointerleave', () => {
      tooltip.hidden = true;
      crosshair.setAttribute('opacity', 0);
    });
  }

  function renderSignalPlot(
    container, result, annotation = null, transcriptAnnotations = null,
    resolution = 'adaptive', displayRange = null, rangeSelection = null,
  ) {
    const summary = summarizeSignals(result, annotation, resolution, displayRange);
    const hasAnnotation = Boolean(summary.annotation);
    const displayAnnotation = summary.annotation || {
      id: `${result.chromosome}:${result.start}-${result.end}`,
      chromosome: result.chromosome,
      start: result.start,
      end: result.end,
      strand: 1,
    };
    const annotationModels = transcriptAnnotationsForDisplay(
      displayAnnotation,
      transcriptAnnotations || (summary.annotation ? [summary.annotation] : []),
      {
        genomicRange: { start: result.start, end: result.end },
        includeOppositeStrands: true,
        sortByPosition: !hasAnnotation,
        includeDisplayFallback: false,
      },
    );
    const hasAnnotationTracks = annotationModels.length > 0;
    const width = 1000;
    const height = hasAnnotationTracks
      ? Math.max(700, 592 + annotationModels.length * 24)
      : 520;
    const plotLeft = hasAnnotationTracks ? 115 : 86;
    const plotRight = 976;
    const plotWidth = plotRight - plotLeft;
    const csTop = 76;
    const csHeight = 230;
    const snpTop = 340;
    const snpHeight = 105;
    const svg = svgElement('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': `Binned conservation and SNP-density tracks for ${result.chromosome}:${summary.displayStart}-${summary.displayEnd}`,
      class: 'live-svg signal-svg',
    });
    const xScale = linearScale(summary.minimum, summary.maximum, plotLeft, plotRight);
    const csScale = linearScale(0, 1, csTop + csHeight, csTop);
    const snpScale = linearScale(0, 1, snpTop + snpHeight, snpTop);

    addText(svg, 'Binned conservation profile and SNP density', plotLeft, 27, {
      fill: COLORS.ink, 'font-size': 18, 'font-weight': 700,
    });
    addText(svg, `${result.chromosome}:${summary.displayStart.toLocaleString()}–${summary.displayEnd.toLocaleString()} · ${summary.cs.length} display bins · exact full-query arrays retained for TSV download`, plotLeft, 49, {
      fill: COLORS.muted, 'font-size': 12,
    });
    drawYAxis(svg, plotLeft, csTop, csHeight, 'Conservation score');
    drawYAxis(svg, plotLeft, snpTop, snpHeight, 'SNP density');

    const outer = areaPath(summary.cs, (point) => xScale(point.position), (point) => csScale(point.q90), (point) => csScale(point.q10));
    const inner = areaPath(summary.cs, (point) => xScale(point.position), (point) => csScale(point.q75), (point) => csScale(point.q25));
    svg.append(svgElement('path', { d: outer, fill: COLORS.csOuter, opacity: 0.38 }));
    svg.append(svgElement('path', { d: inner, fill: COLORS.csMid, opacity: 0.45 }));
    svg.append(svgElement('path', {
      d: linePath(summary.cs, (point) => xScale(point.position), (point) => csScale(point.median)),
      fill: 'none', stroke: COLORS.cs, 'stroke-width': 2,
    }));

    const snpArea = areaPath(summary.snp, (point) => xScale(point.position), (point) => snpScale(point.mean), () => snpScale(0));
    svg.append(svgElement('path', { d: snpArea, fill: COLORS.snp, opacity: 0.25 }));
    svg.append(svgElement('path', {
      d: linePath(summary.snp, (point) => xScale(point.position), (point) => snpScale(point.mean)),
      fill: 'none', stroke: COLORS.snp, 'stroke-width': 2,
    }));

    const cellWidth = summary.records.length > 1 ? plotWidth / (summary.records.length - 1) : plotWidth;
    inaccessibleRuns(summary.records).forEach(([startIndex, endIndex]) => {
      const left = Math.max(plotLeft, xScale(summary.records[startIndex].x) - cellWidth / 2);
      const right = Math.min(plotRight, xScale(summary.records[endIndex].x) + cellWidth / 2);
      svg.append(svgElement('rect', {
        x: left, y: snpTop, width: Math.max(1, right - left), height: snpHeight,
        fill: COLORS.unknown, opacity: 0.25,
      }));
    });

    if (hasAnnotation) {
      cdsSegments(summary.annotation).flat()
        .filter((position) => position >= summary.minimum && position <= summary.maximum)
        .forEach((position) => {
        const x = xScale(position);
        for (const [top, panelHeight] of [[csTop, csHeight], [snpTop, snpHeight]]) {
          svg.append(svgElement('line', {
            x1: x, x2: x, y1: top, y2: top + panelHeight,
            stroke: '#595959', 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: 0.6,
          }));
        }
        });
      const onlyQueriedModel = annotationModels.length === 1
        && annotationModels[0].transcript_id === summary.annotation.transcript_id;
      if (annotationModels.length && !onlyQueriedModel) {
        drawTranscriptModels(
          svg, summary.annotation, annotationModels, xScale, 478,
          summary.minimum, summary.maximum,
          {
            selectedTranscriptId: summary.annotation.transcript_id,
            genomicRange: { start: summary.displayStart, end: summary.displayEnd },
            filterRange: { start: result.start, end: result.end },
            includeOppositeStrands: true,
            title: `Gene/transcript models (${annotationModels.length}; queried representative in bold)`,
          },
        );
      } else if (onlyQueriedModel) {
        drawGeneModel(svg, summary.annotation, xScale, 490, summary.minimum, summary.maximum);
      } else {
        drawXAxis(
          svg, xScale, summary.minimum, summary.maximum, snpTop + snpHeight,
          `Position relative to ${summary.annotation.id} transcription start (bp)`,
        );
      }
    } else if (hasAnnotationTracks) {
      drawTranscriptModels(
        svg, displayAnnotation, annotationModels, xScale, 478,
        summary.minimum, summary.maximum,
        {
          genomicRange: { start: summary.displayStart, end: summary.displayEnd },
          filterRange: { start: result.start, end: result.end },
          includeOppositeStrands: true,
          sortByPosition: true,
          title: `Overlapping gene models (${annotationModels.length}; representative transcript per gene)`,
          axisLabel: `Position in plotted region (bp; Chromosome ${result.chromosome}: ${summary.displayStart.toLocaleString()}–${summary.displayEnd.toLocaleString()})`,
        },
      );
    } else {
      drawXAxis(
        svg, xScale, summary.minimum, summary.maximum, snpTop + snpHeight,
        `Position in plotted region (bp; Chromosome ${result.chromosome}: ${summary.displayStart.toLocaleString()}–${summary.displayEnd.toLocaleString()})`,
      );
    }

    addLegendItem(svg, 565, 27, 'Median Cs', { line: true, color: COLORS.cs });
    addLegendItem(svg, 685, 27, 'Cs 25th–75th', { color: COLORS.csMid, opacity: 0.45 });
    addLegendItem(svg, 838, 27, 'Cs 10th–90th', { color: COLORS.csOuter, opacity: 0.5 });
    addLegendItem(svg, 565, snpTop + 20, 'Mean SNP (accessible bases)', { line: true, color: COLORS.snp });
    addLegendItem(svg, 785, snpTop + 20, 'QC failed / unknown', { color: COLORS.unknown, opacity: 0.3 });

    container.replaceChildren(svg);
    installSignalTooltip(container, svg, summary, xScale, plotLeft, plotWidth, csTop, snpTop + snpHeight);
    installPlotRangeSelector(
      svg, summary, plotLeft, plotWidth, csTop, snpTop + snpHeight, rangeSelection,
    );
    return summary;
  }

  function blendedIdentityColor(identity, detectedFraction) {
    return plotModel.blendedIdentityColor(
      identity, detectedFraction, requirePlotContract(),
    );
  }

  function abbreviatedSpeciesName(name) {
    const parts = name.trim().split(/\s+/);
    const abbreviation = GENUS_ABBREVIATIONS.get(parts[0]);
    return abbreviation && parts.length > 1
      ? `${abbreviation} ${parts.slice(1).join(' ')}`
      : name.trim();
  }

  function topologyTipCodes(node) {
    if (typeof node === 'string') return [node];
    if (!node || !Array.isArray(node.children)) {
      throw new Error('Species topology nodes must be genome codes or child-bearing objects.');
    }
    return node.children.flatMap(topologyTipCodes);
  }

  function validateSpeciesTopology(topology, stackRows) {
    if (topology?.schema_version !== 1 || !topology.tree) {
      throw new Error('The species topology is missing or uses an unsupported schema.');
    }
    const tips = topologyTipCodes(topology.tree);
    const duplicates = tips.filter((code, index) => tips.indexOf(code) !== index);
    if (duplicates.length) {
      throw new Error(`The species topology repeats genome codes: ${[...new Set(duplicates)].join(', ')}.`);
    }
    if (tips.length !== stackRows.length || tips.some((code, index) => code !== stackRows[index])) {
      throw new Error('The species topology does not match the metadata genome-code order.');
    }
    return topology.tree;
  }

  function topologyDepth(node) {
    if (typeof node === 'string') return 0;
    return 1 + Math.max(...node.children.map(topologyDepth));
  }

  function drawCladogram(svg, rowTop, rowHeight, tree, stackRows) {
    const maximumDepth = topologyDepth(tree);
    const left = 22;
    const tip = 66;
    const rowByCode = new Map(stackRows.map((code, index) => [code, index]));
    const xForDepth = (depth) => left + (tip - left) * depth / maximumDepth;
    const draw = (node, depth = 0) => {
      if (typeof node === 'string') {
        return { x: tip, y: rowTop + (rowByCode.get(node) + 0.5) * rowHeight };
      }
      const children = node.children.map((child) => draw(child, depth + 1));
      const x = xForDepth(depth);
      const childYs = children.map((child) => child.y);
      const minimumY = Math.min(...childYs);
      const maximumY = Math.max(...childYs);
      svg.append(svgElement('line', {
        x1: x, x2: x, y1: minimumY, y2: maximumY,
        stroke: COLORS.muted, 'stroke-width': 1,
      }));
      children.forEach((child) => svg.append(svgElement('line', {
        x1: x, x2: child.x, y1: child.y, y2: child.y,
        stroke: COLORS.muted, 'stroke-width': 1,
      })));
      return { x, y: childYs.reduce((total, y) => total + y, 0) / childYs.length };
    };
    draw(tree);
  }

  function installHeatmapTooltip(container, svg, summary, result, plotLeft, plotWidth, rowTop, rowHeight) {
    const tooltip = document.createElement('div');
    tooltip.className = 'live-tooltip';
    tooltip.hidden = true;
    container.append(tooltip);
    svg.addEventListener('pointermove', (event) => {
      const bounds = svg.getBoundingClientRect();
      const viewX = (event.clientX - bounds.left) / bounds.width * 1000;
      const viewY = (event.clientY - bounds.top) / bounds.height * Number(svg.getAttribute('viewBox').split(' ')[3]);
      const row = Math.floor((viewY - rowTop) / rowHeight);
      const bin = Math.floor((viewX - plotLeft) / plotWidth * summary.bins.length);
      if (row < 0 || row >= result.stackRows.length || bin < 0 || bin >= summary.bins.length) {
        tooltip.hidden = true;
        return;
      }
      const cell = summary.cells[row][bin];
      tooltip.innerHTML = `<strong>${result.stackSpecies[row]}</strong><span>${cell.genomicStart.toLocaleString()}–${cell.genomicEnd.toLocaleString()}</span><span>${cell.detectedFraction ? `${cell.identity.toFixed(1)}% mean identity` : 'No detected CNEr interval'}</span><span>${(cell.detectedFraction * 100).toFixed(0)}% of display bin detected</span>`;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.min(bounds.width - 190, Math.max(8, event.clientX - bounds.left + 12))}px`;
      tooltip.style.top = `${Math.max(8, event.clientY - bounds.top - 64)}px`;
    });
    svg.addEventListener('pointerleave', () => { tooltip.hidden = true; });
  }

  function renderHeatmap(
    container, result, annotation = null, transcriptAnnotations = null,
    resolution = 'adaptive', displayRange = null, rangeSelection = null,
  ) {
    const summary = summarizeHeatmap(result, annotation, resolution, displayRange);
    const speciesTree = validateSpeciesTopology(result.stackTopology, result.stackRows);
    const hasAnnotation = Boolean(summary.annotation);
    const displayAnnotation = summary.annotation || {
      id: `${result.chromosome}:${result.start}-${result.end}`,
      chromosome: result.chromosome,
      start: result.start,
      end: result.end,
      strand: 1,
    };
    const annotationModels = transcriptAnnotationsForDisplay(
      displayAnnotation,
      transcriptAnnotations || (summary.annotation ? [summary.annotation] : []),
      {
        genomicRange: { start: result.start, end: result.end },
        includeOppositeStrands: true,
        sortByPosition: !hasAnnotation,
        includeDisplayFallback: false,
      },
    );
    const hasAnnotationTracks = annotationModels.length > 0;
    const geometry = plotModel.heatmapGeometry(
      result.stackRows.length,
      summary.bins.length,
      requirePlotContract(),
      hasAnnotationTracks ? annotationModels.length : 0,
    );
    const {
      width, height, rowTop, rowHeight, plotLeft, plotRight, plotWidth, plotHeight,
    } = geometry;
    const svg = svgElement('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-labelledby': 'agamcs-live-heatmap-title agamcs-live-heatmap-description',
      class: 'live-svg heatmap-svg',
    });
    const accessibleTitle = svgElement('title', { id: 'agamcs-live-heatmap-title' });
    accessibleTitle.textContent = requirePlotContract().heatmap_layout.title;
    const accessibleDescription = svgElement('desc', { id: 'agamcs-live-heatmap-description' });
    accessibleDescription.textContent = `AgamP4 ${result.chromosome}:${summary.displayStart}-${summary.displayEnd}; ${summary.bins.length} display bins. Zero means no detected CNEr interval, not measured zero percent identity. QC-failed SNP positions remain unknown.`;
    svg.append(accessibleTitle, accessibleDescription);
    const xScale = linearScale(summary.minimum, summary.maximum, plotLeft, plotRight);
    const cellWidth = plotWidth / summary.bins.length;

    addText(svg, requirePlotContract().heatmap_layout.title, plotLeft, 27, {
      fill: COLORS.ink, 'font-size': 18, 'font-weight': 700,
    });
    addText(svg, `${result.chromosome}:${summary.displayStart.toLocaleString()}–${summary.displayEnd.toLocaleString()} · ${result.stackRows.length} metadata-ordered species · ${summary.bins.length} display bins`, plotLeft, 49, {
      fill: COLORS.muted, 'font-size': 12,
    });
    addText(svg, 'Evidence-bounded cladogram', 22, 22, {
      fill: COLORS.muted, 'font-size': 10, 'font-weight': 650,
    });
    CLADE_NAMES.forEach((name, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 22 + column * 108;
      const y = 43 + row * 18;
      svg.append(svgElement('rect', { x, y: y - 9, width: 9, height: 9, fill: CLADE_COLORS[index] }));
      addText(svg, name, x + 14, y, { fill: COLORS.muted, 'font-size': 9 });
    });
    drawCladogram(svg, rowTop, rowHeight, speciesTree, result.stackRows);

    summary.cells.forEach((row, rowIndex) => {
      const y = rowTop + rowIndex * rowHeight;
      const cladeIndex = CLADE_RANGES.findIndex(([start, end]) => rowIndex >= start && rowIndex <= end);
      svg.append(svgElement('rect', {
        x: 72, y: y + 2, width: 4, height: rowHeight - 4,
        fill: CLADE_COLORS[cladeIndex],
      }));
      addText(svg, abbreviatedSpeciesName(result.stackSpecies[rowIndex]), plotLeft - 12, y + rowHeight * 0.68, {
        'text-anchor': 'end', fill: COLORS.ink, 'font-size': 11,
        'font-style': 'italic', 'font-weight': 600,
      });
      row.forEach((cell, binIndex) => {
        svg.append(svgElement('rect', {
          x: plotLeft + binIndex * cellWidth,
          y,
          width: cellWidth + 0.25,
          height: rowHeight + 0.25,
          fill: blendedIdentityColor(cell.identity, cell.detectedFraction),
          'shape-rendering': 'crispEdges',
        }));
      });
    });

    const legendY = rowTop + plotHeight + 27;
    const noIntervalColor = `rgb(${requirePlotContract().palette.no_interval_rgb.join(',')})`;
    addLegendItem(svg, plotLeft, legendY, requirePlotContract().heatmap_layout.no_interval_label, {
      color: noIntervalColor,
    });
    const gradient = svgElement('linearGradient', { id: 'identity-gradient', x1: 0, x2: 1, y1: 0, y2: 0 });
    requirePlotContract().palette.viridis_anchors.forEach(([offset, rgb]) => gradient.append(svgElement('stop', {
      offset: `${offset * 100}%`, 'stop-color': `rgb(${rgb.join(',')})`,
    })));
    const defs = svgElement('defs');
    defs.append(gradient);
    svg.prepend(defs);
    svg.append(svgElement('rect', { x: 700, y: legendY - 13, width: 190, height: 13, fill: 'url(#identity-gradient)' }));
    addText(svg, '0', 696, legendY + 16, { 'text-anchor': 'middle', fill: COLORS.muted, 'font-size': 10 });
    addText(svg, '100', 894, legendY + 16, { 'text-anchor': 'middle', fill: COLORS.muted, 'font-size': 10 });
    addText(svg, requirePlotContract().heatmap_layout.identity_label, 795, legendY + 32, {
      'text-anchor': 'middle', fill: COLORS.muted, 'font-size': 11,
    });

    if (hasAnnotation) {
      drawCdsStrip(
        svg, summary.annotation, xScale, rowTop - 10, summary.minimum, summary.maximum,
      );
      cdsSegments(summary.annotation).flat()
        .filter((position) => position >= summary.minimum && position <= summary.maximum)
        .forEach((position) => {
        const x = xScale(position);
        svg.append(svgElement('line', {
          x1: x, x2: x, y1: rowTop, y2: rowTop + plotHeight,
          stroke: '#ffffff', 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: 0.72,
        }));
        });
      const onlyQueriedModel = annotationModels.length === 1
        && annotationModels[0].transcript_id === summary.annotation.transcript_id;
      if (annotationModels.length && !onlyQueriedModel) {
        drawTranscriptModels(
          svg, summary.annotation, annotationModels, xScale, legendY + 60,
          summary.minimum, summary.maximum,
          {
            labelX: plotLeft - 10,
            titleX: plotLeft,
            centre: (plotLeft + plotRight) / 2,
            legendLeft: 700,
            selectedTranscriptId: summary.annotation.transcript_id,
            genomicRange: { start: summary.displayStart, end: summary.displayEnd },
            filterRange: { start: result.start, end: result.end },
            includeOppositeStrands: true,
            title: `Gene/transcript models (${annotationModels.length}; queried representative in bold)`,
          },
        );
      } else if (onlyQueriedModel) {
        drawGeneModel(
          svg, summary.annotation, xScale, legendY + 70, summary.minimum, summary.maximum,
          { labelLeft: plotLeft, centre: (plotLeft + plotRight) / 2, legendLeft: 700 },
        );
      } else {
        drawXAxis(
          svg, xScale, summary.minimum, summary.maximum, rowTop + plotHeight,
          `Position relative to ${summary.annotation.id} transcription start (bp)`,
        );
      }
    } else if (hasAnnotationTracks) {
      drawTranscriptModels(
        svg, displayAnnotation, annotationModels, xScale, legendY + 60,
        summary.minimum, summary.maximum,
        {
          labelX: plotLeft - 10,
          titleX: plotLeft,
          centre: (plotLeft + plotRight) / 2,
          legendLeft: 700,
          genomicRange: { start: summary.displayStart, end: summary.displayEnd },
          filterRange: { start: result.start, end: result.end },
          includeOppositeStrands: true,
          sortByPosition: true,
          title: `Overlapping gene models (${annotationModels.length}; representative transcript per gene)`,
          axisLabel: `Position in plotted region (bp; Chromosome ${result.chromosome}: ${summary.displayStart.toLocaleString()}–${summary.displayEnd.toLocaleString()})`,
        },
      );
    } else {
      drawXAxis(
        svg, xScale, summary.minimum, summary.maximum, rowTop + plotHeight,
        `Position in plotted region (bp; Chromosome ${result.chromosome}: ${summary.displayStart.toLocaleString()}–${summary.displayEnd.toLocaleString()})`,
      );
    }

    container.replaceChildren(svg);
    installHeatmapTooltip(container, svg, summary, result, plotLeft, plotWidth, rowTop, rowHeight);
    installPlotRangeSelector(
      svg, summary, plotLeft, plotWidth, rowTop, rowTop + plotHeight, rangeSelection,
    );
    return summary;
  }

  global.AgamCsPlots = {
    annotationMatches,
    blendedIdentityColor,
    cdsSegments,
    configurePlotContract,
    requirePlotContract,
    transcriptModelGeometry,
    transcriptAnnotationsForDisplay,
    quantile,
    rangeFromDisplayBins,
    summarizeQuery,
    summarizeSignals,
    summarizeHeatmap,
    vectorBaseGeneUrl,
    abbreviatedSpeciesName,
    topologyTipCodes,
    validateSpeciesTopology,
    renderSignalPlot,
    renderHeatmap,
  };
}(globalThis));
