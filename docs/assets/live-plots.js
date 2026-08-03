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
    noInterval: '#2f2f2f',
    cds: '#2171b5',
    cdsEdge: '#084594',
    utr: '#deebf7',
    intron: '#4d4d4d',
  };
  const CLADE_COLORS = ['#3f007d', '#8c2981', '#cc4678', '#d95f0e'];
  const CLADE_NAMES = ['gambiae complex', 'Other Anopheles', 'New World', 'Outgroups'];
  const CLADE_RANGES = [[0, 4], [5, 15], [16, 17], [18, 20]];
  const VIRIDIS = [
    [0, [68, 1, 84]],
    [0.25, [59, 82, 139]],
    [0.5, [33, 145, 140]],
    [0.75, [94, 201, 98]],
    [1, [253, 231, 37]],
  ];

  function quantile(values, proportion) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return Number.NaN;
    const position = (sorted.length - 1) * proportion;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
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

  function annotationMatches(result, annotation) {
    return Boolean(
      annotation
      && String(annotation.chromosome) === String(result.chromosome)
      && Number(annotation.start) === result.start
      && Number(annotation.end) === result.end
    );
  }

  function coordinateRecords(result, annotation) {
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
        Cs: result.values.Cs[index],
        snp: result.values.snp_density[index],
        status: result.values.status[index],
      };
    });
    records.sort((left, right) => left.x - right.x);
    return { records, annotation: useAnnotation ? annotation : null };
  }

  function assignBins(records, maximumBins) {
    const binCount = Math.min(Math.max(1, maximumBins), records.length);
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

  function summarizeSignals(result, annotation = null, maximumBins = 240) {
    const mapped = coordinateRecords(result, annotation);
    const assigned = assignBins(mapped.records, maximumBins);
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

  function summarizeHeatmap(result, annotation = null, maximumBins = 500) {
    const mapped = coordinateRecords(result, annotation);
    const assigned = assignBins(mapped.records, maximumBins);
    const rowCount = result.stackRows.length;
    const sourceWidth = result.values.Cs.length;
    const cells = Array.from({ length: rowCount }, () => []);
    for (let row = 0; row < rowCount; row += 1) {
      for (const bin of assigned.bins) {
        let detected = 0;
        let totalIdentity = 0;
        for (const record of bin) {
          const value = result.values.stack[row * sourceWidth + record.index];
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
    if (annotation.cds_start == null || annotation.cds_end == null) return [];
    const mapper = Number(annotation.strand) === -1
      ? (position) => Number(annotation.end) - position
      : (position) => position - Number(annotation.start);
    return (annotation.exons || []).flatMap((exon) => {
      const start = Math.max(Number(exon.start), Number(annotation.cds_start));
      const end = Math.min(Number(exon.end), Number(annotation.cds_end));
      return start <= end ? [[Math.min(mapper(start), mapper(end)), Math.max(mapper(start), mapper(end))]] : [];
    }).sort((left, right) => left[0] - right[0]);
  }

  function drawCdsStrip(svg, annotation, xScale, y) {
    cdsSegments(annotation).forEach(([left, right]) => {
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
    const exons = (annotation.exons || []).map((exon) => ({
      left: Math.min(mapper(Number(exon.start)), mapper(Number(exon.end))),
      right: Math.max(mapper(Number(exon.start)), mapper(Number(exon.end))),
      exon,
    })).sort((left, right) => left.left - right.left);

    for (let index = 1; index < exons.length; index += 1) {
      svg.append(svgElement('line', {
        x1: xScale(exons[index - 1].right), x2: xScale(exons[index].left),
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
    cdsSegments(annotation).forEach(([left, right]) => {
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
    addText(svg, `${annotation.transcript_id || annotation.id} (${strand} strand; shown 5′→3′)`, labelLeft, y + 34, {
      fill: COLORS.ink, 'font-size': 13, 'font-weight': 650,
    });
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

  function renderSignalPlot(container, result, annotation = null) {
    const summary = summarizeSignals(result, annotation, 240);
    const hasAnnotation = Boolean(summary.annotation);
    const width = 1000;
    const height = hasAnnotation ? 700 : 520;
    const plotLeft = 86;
    const plotRight = 976;
    const plotWidth = plotRight - plotLeft;
    const csTop = 76;
    const csHeight = 230;
    const snpTop = 340;
    const snpHeight = 105;
    const svg = svgElement('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': `Binned conservation and SNP-density tracks for ${result.chromosome}:${result.start}-${result.end}`,
      class: 'live-svg signal-svg',
    });
    const xScale = linearScale(summary.minimum, summary.maximum, plotLeft, plotRight);
    const csScale = linearScale(0, 1, csTop + csHeight, csTop);
    const snpScale = linearScale(0, 1, snpTop + snpHeight, snpTop);

    addText(svg, 'Binned conservation profile and SNP density', plotLeft, 27, {
      fill: COLORS.ink, 'font-size': 18, 'font-weight': 700,
    });
    addText(svg, `${result.chromosome}:${result.start.toLocaleString()}–${result.end.toLocaleString()} · ${summary.cs.length} display bins · exact arrays retained for TSV download`, plotLeft, 49, {
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
      cdsSegments(summary.annotation).flat().forEach((position) => {
        const x = xScale(position);
        for (const [top, panelHeight] of [[csTop, csHeight], [snpTop, snpHeight]]) {
          svg.append(svgElement('line', {
            x1: x, x2: x, y1: top, y2: top + panelHeight,
            stroke: '#595959', 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: 0.6,
          }));
        }
      });
      drawGeneModel(svg, summary.annotation, xScale, 490, summary.minimum, summary.maximum);
    } else {
      drawXAxis(
        svg, xScale, summary.minimum, summary.maximum, snpTop + snpHeight,
        `Position in plotted region (bp; Chromosome ${result.chromosome}: ${result.start.toLocaleString()}–${result.end.toLocaleString()})`,
      );
    }

    addLegendItem(svg, 565, 27, 'Median Cs', { line: true, color: COLORS.cs });
    addLegendItem(svg, 685, 27, 'Cs 25th–75th', { color: COLORS.csMid, opacity: 0.45 });
    addLegendItem(svg, 838, 27, 'Cs 10th–90th', { color: COLORS.csOuter, opacity: 0.5 });
    addLegendItem(svg, 565, snpTop + 20, 'Mean SNP (accessible bases)', { line: true, color: COLORS.snp });
    addLegendItem(svg, 785, snpTop + 20, 'QC failed / unknown', { color: COLORS.unknown, opacity: 0.3 });

    container.replaceChildren(svg);
    installSignalTooltip(container, svg, summary, xScale, plotLeft, plotWidth, csTop, snpTop + snpHeight);
    return summary;
  }

  function interpolateColor(value) {
    const bounded = Math.max(0, Math.min(1, value));
    let lower = VIRIDIS[0];
    let upper = VIRIDIS[VIRIDIS.length - 1];
    for (let index = 1; index < VIRIDIS.length; index += 1) {
      if (bounded <= VIRIDIS[index][0]) {
        lower = VIRIDIS[index - 1];
        upper = VIRIDIS[index];
        break;
      }
    }
    const fraction = (bounded - lower[0]) / (upper[0] - lower[0] || 1);
    const rgb = lower[1].map((channel, index) => Math.round(channel + (upper[1][index] - channel) * fraction));
    return rgb;
  }

  function blendedIdentityColor(identity, detectedFraction) {
    if (!detectedFraction) return COLORS.noInterval;
    const identityRgb = interpolateColor(identity / 100);
    const background = [47, 47, 47];
    const strength = 0.35 + detectedFraction * 0.65;
    const rgb = identityRgb.map((channel, index) => Math.round(background[index] + (channel - background[index]) * strength));
    return `rgb(${rgb.join(',')})`;
  }

  function drawCladogram(svg, rowTop, rowHeight) {
    const centre = (start, end) => rowTop + ((start + end + 1) / 2) * rowHeight;
    CLADE_RANGES.forEach(([start, end]) => {
      const y1 = rowTop + (start + 0.5) * rowHeight;
      const y2 = rowTop + (end + 0.5) * rowHeight;
      svg.append(svgElement('line', { x1: 74, x2: 74, y1, y2, stroke: COLORS.muted, 'stroke-width': 1 }));
      for (let row = start; row <= end; row += 1) {
        const y = rowTop + (row + 0.5) * rowHeight;
        svg.append(svgElement('line', { x1: 74, x2: 96, y1: y, y2: y, stroke: COLORS.muted, 'stroke-width': 1 }));
      }
    });
    const mainCentres = CLADE_RANGES.slice(0, 3).map(([start, end]) => centre(start, end));
    const outCentre = centre(18, 20);
    svg.append(svgElement('line', { x1: 53, x2: 53, y1: mainCentres[0], y2: mainCentres[2], stroke: COLORS.muted }));
    mainCentres.forEach((y) => svg.append(svgElement('line', { x1: 53, x2: 74, y1: y, y2: y, stroke: COLORS.muted })));
    const mainCentre = (mainCentres[0] + mainCentres[2]) / 2;
    svg.append(svgElement('line', { x1: 31, x2: 31, y1: mainCentre, y2: outCentre, stroke: COLORS.muted }));
    svg.append(svgElement('line', { x1: 31, x2: 53, y1: mainCentre, y2: mainCentre, stroke: COLORS.muted }));
    svg.append(svgElement('line', { x1: 31, x2: 74, y1: outCentre, y2: outCentre, stroke: COLORS.muted }));
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

  function renderHeatmap(container, result, annotation = null) {
    const summary = summarizeHeatmap(result, annotation, 500);
    const hasAnnotation = Boolean(summary.annotation);
    const width = 1000;
    const rowTop = 78;
    const rowHeight = 23;
    const plotLeft = 310;
    const plotRight = 930;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = result.stackRows.length * rowHeight;
    const height = rowTop + plotHeight + (hasAnnotation ? 290 : 92);
    const svg = svgElement('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': `Cross-species conserved-interval heatmap for ${result.chromosome}:${result.start}-${result.end}`,
      class: 'live-svg heatmap-svg',
    });
    const xScale = linearScale(summary.minimum, summary.maximum, plotLeft, plotRight);
    const cellWidth = plotWidth / summary.bins.length;

    addText(svg, 'Conserved intervals mapped to AgamP4 positions', plotLeft, 27, {
      fill: COLORS.ink, 'font-size': 18, 'font-weight': 700,
    });
    addText(svg, `${result.stackRows.length} metadata-ordered species · ${summary.bins.length} display bins`, plotLeft, 49, {
      fill: COLORS.muted, 'font-size': 12,
    });
    addText(svg, 'Unscaled broad-group cladogram', 31, 22, {
      fill: COLORS.muted, 'font-size': 10, 'font-weight': 650,
    });
    CLADE_NAMES.forEach((name, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 31 + column * 132;
      const y = 43 + row * 18;
      svg.append(svgElement('rect', { x, y: y - 9, width: 9, height: 9, fill: CLADE_COLORS[index] }));
      addText(svg, name, x + 14, y, { fill: COLORS.muted, 'font-size': 9 });
    });
    drawCladogram(svg, rowTop, rowHeight);

    summary.cells.forEach((row, rowIndex) => {
      const y = rowTop + rowIndex * rowHeight;
      const cladeIndex = CLADE_RANGES.findIndex(([start, end]) => rowIndex >= start && rowIndex <= end);
      svg.append(svgElement('rect', {
        x: 104, y: y + 2, width: 4, height: rowHeight - 4,
        fill: CLADE_COLORS[cladeIndex],
      }));
      addText(svg, result.stackSpecies[rowIndex].trim(), 292, y + rowHeight * 0.68, {
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
    addLegendItem(svg, plotLeft, legendY, 'No detected CNEr interval', { color: COLORS.noInterval });
    const gradient = svgElement('linearGradient', { id: 'identity-gradient', x1: 0, x2: 1, y1: 0, y2: 0 });
    VIRIDIS.forEach(([offset, rgb]) => gradient.append(svgElement('stop', {
      offset: `${offset * 100}%`, 'stop-color': `rgb(${rgb.join(',')})`,
    })));
    const defs = svgElement('defs');
    defs.append(gradient);
    svg.prepend(defs);
    svg.append(svgElement('rect', { x: 700, y: legendY - 13, width: 190, height: 13, fill: 'url(#identity-gradient)' }));
    addText(svg, '0', 696, legendY + 16, { 'text-anchor': 'middle', fill: COLORS.muted, 'font-size': 10 });
    addText(svg, '100', 894, legendY + 16, { 'text-anchor': 'middle', fill: COLORS.muted, 'font-size': 10 });
    addText(svg, 'Identity (%) when interval detected', 795, legendY + 32, {
      'text-anchor': 'middle', fill: COLORS.muted, 'font-size': 11,
    });

    if (hasAnnotation) {
      drawCdsStrip(svg, summary.annotation, xScale, rowTop - 10);
      cdsSegments(summary.annotation).flat().forEach((position) => {
        const x = xScale(position);
        svg.append(svgElement('line', {
          x1: x, x2: x, y1: rowTop, y2: rowTop + plotHeight,
          stroke: '#ffffff', 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: 0.72,
        }));
      });
      drawGeneModel(
        svg, summary.annotation, xScale, legendY + 70, summary.minimum, summary.maximum,
        { labelLeft: plotLeft, centre: (plotLeft + plotRight) / 2, legendLeft: 700 },
      );
    } else {
      drawXAxis(
        svg, xScale, summary.minimum, summary.maximum, rowTop + plotHeight,
        `Position in plotted region (bp; Chromosome ${result.chromosome}: ${result.start.toLocaleString()}–${result.end.toLocaleString()})`,
      );
    }

    container.replaceChildren(svg);
    installHeatmapTooltip(container, svg, summary, result, plotLeft, plotWidth, rowTop, rowHeight);
    return summary;
  }

  global.AgamCsPlots = {
    annotationMatches,
    cdsSegments,
    quantile,
    summarizeSignals,
    summarizeHeatmap,
    renderSignalPlot,
    renderHeatmap,
  };
}(globalThis));
