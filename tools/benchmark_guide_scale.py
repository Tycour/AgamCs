"""Bounded CRISPOR throughput and catalogue-size benchmark; large outputs stay external.

Reuse the existing full-reference index. Prepare counts all valid NGG candidate
loci without scoring them; run scores seven small batches with fresh temp dirs.
Completed batches are validated and skipped on resume. This is not a production
catalogue builder or a genome-wide scoring command.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import importlib.util
import json
import random
import re
import shlex
import shutil
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_REFERENCE = 'dd0d2bf6fd9913a7887873753306bd14db399552a5703a099aea0af055c8b505'
CONTAINER = 'agamcs-guide-scale'
GIB = 1024 ** 3


def save(path, data):
    temporary = path.with_suffix(path.suffix + '.partial')
    temporary.write_text(json.dumps(data, indent=2) + '\n')
    temporary.replace(path)


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def fasta_records(path):
    name, parts = None, []
    with path.open('rb') as handle:
        for line in handle:
            if line.startswith(b'>'):
                if name is not None:
                    yield name, b''.join(parts).upper()
                name, parts = line[1:].split()[0].decode(), []
            else:
                parts.append(line.strip())
    if name is not None:
        yield name, b''.join(parts).upper()


def candidate_counts(sequence, tile_size=10000):
    """Count both strands, overlapping PAMs, and only complete A/C/G/T targets.

    Tiles own sites by the lower genomic coordinate of the full 23-base target.
    A site may cross a tile edge; the two strands are distinct candidate loci.
    """
    tiles = [0] * ((len(sequence) + tile_size - 1) // tile_size)
    counts = {'+': 0, '-': 0}
    for run in re.finditer(b'[ACGT]{23,}', sequence):
        bases = run.group()
        for strand, pattern, part in [('+', b'(?=GG)', bases[21:]), ('-', b'(?=CC)', bases[:-21])]:
            for match in re.finditer(pattern, part):
                counts[strand] += 1
                tiles[(run.start() + match.start()) // tile_size] += 1
    return counts, tiles


def quantiles(values):
    ordered = sorted(values)
    return {name: ordered[round((len(ordered) - 1) * fraction)]
            for name, fraction in [('min', 0), ('p50', .5), ('p95', .95), ('p99', .99), ('max', 1)]}


def indexed_sequence(fasta, index, name, start, end):
    length, offset, line_bases, line_bytes = index[name]
    assert 1 <= start <= end <= length
    first = start - 1
    byte_start = offset + first // line_bases * line_bytes + first % line_bases
    last = end - 1
    byte_end = offset + last // line_bases * line_bytes + last % line_bases + 1
    with fasta.open('rb') as handle:
        handle.seek(byte_start)
        sequence = handle.read(byte_end - byte_start).replace(b'\n', b'').replace(b'\r', b'').upper()
    assert len(sequence) == end - start + 1
    return sequence.decode()


def prepare(data_root, output, scratch):
    output.mkdir(parents=True, exist_ok=True)
    scratch.mkdir(parents=True, exist_ok=True)
    fasta = data_root / 'reference/VectorBase-68_AgambiaePEST_Genome.fasta'
    checksum = digest(fasta)
    if checksum != EXPECTED_REFERENCE:
        raise ValueError('Reference checksum differs from the prototype')
    index = {row[0]: tuple(map(int, row[1:5])) for line in fasta.with_suffix('.fasta.fai').read_text().splitlines()
             if (row := line.split('\t'))}
    chromosomes = json.loads((ROOT / 'docs/assets/data/query-manifest.json').read_text())['chromosomes']
    source = data_root / 'prototype/crispor-source.py'
    shutil.copyfile(source, output / 'crispor-source.py')
    stats_path = output / 'reference-stats.json'
    if not stats_path.exists():
        records = []
        for name, sequence in fasta_records(fasta):
            counts, tiles = candidate_counts(sequence)
            chromosome = name.removeprefix('AgamP4_')
            row = dict(name=name, bases=len(sequence), unknown_bases=sequence.count(b'N'),
                       candidates=sum(counts.values()), strand_counts=counts,
                       queryable=chromosome in chromosomes)
            if row['queryable']:
                assert len(sequence) == chromosomes[chromosome]['length']
                row['owned_candidates_per_10kb_tile'] = quantiles(tiles[:-1])
                row['owned_candidates_per_aligned_200kb_span'] = quantiles([
                    sum(tiles[i:i + 20]) for i in range(0, len(tiles) - 19, 20)])
            records.append(row)
            print('COUNT', name, row['candidates'], flush=True)
        save(stats_path, dict(reference_sha256=checksum, reference_records=records,
                             all_record_candidates=sum(r['candidates'] for r in records),
                             queryable_candidates=sum(r['candidates'] for r in records if r['queryable']),
                             queryable_bases=sum(r['bases'] for r in records if r['queryable']),
                             note='Counts are candidate loci, not unique spacer sequences or scored guides. All 153 records remain off-target search scope.'))
    if not (output / 'regions.json').exists():
        rng = random.Random(20261017)
        regions = []
        for chromosome, metadata in chromosomes.items():
            start = 1000000 if chromosome == '2L' else rng.randint(1, metadata['length'] - 10000 + 1)
            for length in ([1000, 5000, 10000] if chromosome == '2L' else [10000]):
                sequence = indexed_sequence(fasta, index, 'AgamP4_' + chromosome, start, start + length - 1)
                name = f'{chromosome}-{length}'
                regions.append(dict(id=name, chromosome=chromosome, start=start, end=start + length - 1,
                                    sequence=sequence, primary_sample=length == 10000,
                                    unknown_bases=sequence.count('N')))
        save(output / 'regions.json', regions)
    for region in json.loads((output / 'regions.json').read_text()):
        for base in [output, scratch]:
            directory = base / region['id']
            directory.mkdir(exist_ok=True)
            (directory / 'temp').mkdir(exist_ok=True)
            (directory / 'query.fa').write_text('>' + region['id'] + '\n' + region['sequence'] + '\n')
    print('PREPARED', output, flush=True)


def storage_guard(data_root, scratch, output, directory=None):
    free = {str(path): shutil.disk_usage(path).free for path in [Path('/'), data_root, scratch]}
    if free['/'] < 6 * GIB or free[str(data_root)] < 20 * GIB or free[str(scratch)] < 4 * GIB:
        raise RuntimeError('Storage guard: ' + json.dumps(free))
    if directory and sum(p.stat().st_size for p in directory.rglob('*') if p.is_file()) > 512 * 1024 ** 2:
        raise RuntimeError('Per-batch output/temp guard: 512 MiB')
    save(output / 'live-state.json', dict(free_bytes=free, current_batch=directory.name if directory else None,
                                         updated_unix=time.time()))


def importer():
    spec = importlib.util.spec_from_file_location('guide_catalogue_importer', ROOT / 'tools/build_guide_catalogue.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def package(region, directory, api):
    parsed = api.import_region(region, directory)
    metadata = json.loads((ROOT / 'docs/assets/data/guide-catalogue.json').read_text())
    metadata.pop('regions')
    metadata['scope'] = 'Bounded scale benchmark; not production coverage'
    catalogue = {**metadata, 'regions': [parsed]}
    pretty = (json.dumps(catalogue, indent=2) + '\n').encode()
    compact = json.dumps(catalogue, separators=(',', ':')).encode()
    fields = list(parsed['guides'][0]) if parsed['guides'] else []
    columns = json.dumps(dict(metadata=metadata, region={k: v for k, v in parsed.items() if k != 'guides'}, fields=fields,
                              rows=[[guide[field] for field in fields] for guide in parsed['guides']]),
                         separators=(',', ':')).encode()
    (directory / 'catalogue.json.gz').write_bytes(gzip.compress(compact, compresslevel=6, mtime=0))
    (directory / 'column-rows.json.gz').write_bytes(gzip.compress(columns, compresslevel=6, mtime=0))
    guides = parsed['guides']
    return dict(guides=len(guides), json_pretty_bytes=len(pretty), json_minified_bytes=len(compact),
                json_gzip_bytes=(directory / 'catalogue.json.gz').stat().st_size,
                column_rows_gzip_bytes=(directory / 'column-rows.json.gz').stat().st_size,
                raw_offtarget_bytes=(directory / 'offtargets.tsv').stat().st_size,
                missing_specificity=sum(g['mit_specificity'] is None for g in guides),
                multiple_exact_matches=sum(g['exact_matches'] is not None and g['exact_matches'] > 1 for g in guides),
                unknown_reference_warnings=sum(any('unknown reference' in warning for warning in g['warnings']) for g in guides))


def validate_result(region, directory, result, api):
    # CRISPOR process completion is an immutable importer input. Validation has
    # its own final marker, so an interrupted validation can resume from raw TSVs.
    if not (directory / 'complete.json').exists():
        save(directory / 'complete.json', result)
    result.update(package(region, directory, api))
    if (directory / 'memory.peak').exists():
        result['container_peak_memory_bytes'] = int((directory / 'memory.peak').read_text())
    if (directory / 'cpu.stat').exists():
        result['container_cpu_seconds'] = int((directory / 'cpu.stat').read_text().splitlines()[0].split()[1]) / 1e6
    save(directory / 'validated.json', result)
    print('VALIDATED', region['id'], json.dumps(result), flush=True)


def run(data_root, output, scratch, job_seconds, total_seconds, cleanup):
    try:
        run_batches(data_root, output, scratch, job_seconds, total_seconds)
    finally:
        # Also covers an index/source validation failure before any batch starts.
        if cleanup:
            result = subprocess.run(['docker', 'image', 'rm', 'agamcs-crispor:local', 'maximilianh/crispor:latest'], capture_output=True, text=True)
            (output / 'cleanup.log').write_text(result.stdout + result.stderr)
    summarize(output)


def run_batches(data_root, output, scratch, job_seconds, total_seconds):
    api = importer()
    started = time.monotonic()
    genome = scratch.parent / 'crispor-genomes/agamp4'
    assert all((genome / name).exists() for name in ['agamp4.fa.bwt', 'agamp4.fa.sa', 'agamp4.2bit'])
    expected = digest(output / 'crispor-source.py')
    observed = subprocess.check_output(['docker', 'run', '--rm', '--pull', 'never', '--entrypoint', 'sha256sum',
                                         'agamcs-crispor:local', '/data/www/crispor/crispor.py'], text=True).split()[0]
    assert observed == expected, 'CRISPOR source differs from saved prototype'
    image_id = subprocess.check_output(['docker', 'image', 'inspect', '--format', '{{.Id}}', 'agamcs-crispor:local'], text=True).strip()
    save(output / 'environment.json', dict(image_id=image_id, source_sha256=observed,
         memory_limit_bytes=2 * GIB, cpus=2, job_timeout_seconds=job_seconds,
         total_timeout_seconds=total_seconds, per_batch_bytes_limit=512 * 1024 ** 2,
         search_options=dict(pam='NGG', mm=4, minAltPamScore=101, effScores='fusi,doench'),
         timing='Wall time includes container startup; external index reused, fresh per-batch temporary directory.'))
    try:
        for region in json.loads((output / 'regions.json').read_text()):
            destination = output / region['id']
            work = scratch / region['id']
            if (destination / 'validated.json').exists():
                print('SKIP', region['id'], flush=True)
                continue
            if (destination / 'run-metrics.json').exists():
                previous = json.loads((destination / 'run-metrics.json').read_text())
                if previous['exit_code'] == 0 and not previous['stop_reason'] and all(
                        (destination / name).exists() for name in ['guides.tsv', 'offtargets.tsv']):
                    validate_result(region, destination, previous, api)
                    continue
            if time.monotonic() - started >= total_seconds:
                print('TOTAL TIME LIMIT: remaining batches not started', flush=True)
                break
            storage_guard(data_root, scratch, output)
            # A partial/failed prior run must never be mistaken for cached results.
            shutil.rmtree(work / 'temp')
            (work / 'temp').mkdir()
            container_directory = '/scratch/' + region['id']
            command = './crispor.py --pam NGG --minAltPamScore 101 --mm 4 --genomeDir /scratch-genomes ' + \
                '--tempDir ' + shlex.quote(container_directory + '/temp') + ' --effScores fusi,doench agamp4 ' + \
                shlex.quote(container_directory + '/query.fa') + ' ' + shlex.quote(container_directory + '/guides.tsv') + \
                ' -o ' + shlex.quote(container_directory + '/offtargets.tsv')
            shell = 'cd /data/www/crispor && ' + command + '; scale_exit=$?; '
            for filename in ['memory.peak', 'memory.events', 'cpu.stat']:
                shell += f'cp /sys/fs/cgroup/{filename} {shlex.quote(container_directory + "/" + filename)} 2>/dev/null || true; '
            shell += 'exit "$scale_exit"'
            command = ['docker', 'run', '--rm', '--pull', 'never', '--name', CONTAINER, '--memory', '2g', '--cpus', '2',
                       '--mount', 'type=bind,source=' + str(scratch) + ',target=/scratch',
                       '--mount', 'type=bind,source=' + str(genome.parent) + ',target=/scratch-genomes,readonly',
                       '-e', 'TMPDIR=/scratch/' + region['id'], '--entrypoint', '/bin/bash', 'agamcs-crispor:local', '-lc', shell]
            save(destination / 'command.json', command)
            print('START', region['id'], region['start'], region['end'], flush=True)
            t0 = time.monotonic()
            stop_reason = None
            with (destination / 'run.log').open('w') as log:
                process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
                try:
                    while process.poll() is None:
                        if time.monotonic() - t0 >= job_seconds or time.monotonic() - started >= total_seconds:
                            raise RuntimeError('Time limit')
                        storage_guard(data_root, scratch, output, work)
                        time.sleep(2)
                except BaseException as error:
                    stop_reason = str(error)
                    subprocess.run(['docker', 'stop', '-t', '5', CONTAINER], capture_output=True)
                    if process.poll() is None:
                        process.terminate()
                    process.wait(timeout=15)
                    if isinstance(error, (KeyboardInterrupt, SystemExit)):
                        raise
                code = process.wait()
            seconds = time.monotonic() - t0
            result = dict(seconds=seconds, exit_code=code, stop_reason=stop_reason,
                          region={k: v for k, v in region.items() if k != 'sequence'})
            save(destination / 'run-metrics.json', result)
            if code != 0 or stop_reason:
                print('FAILED', region['id'], result, flush=True)
                continue
            for filename in ['guides.tsv', 'offtargets.tsv', 'memory.peak', 'memory.events', 'cpu.stat']:
                if (work / filename).exists():
                    shutil.copyfile(work / filename, destination / filename)
            # Importer verifies complete enumeration, strands, sequence, score order,
            # PAM scope, and reconciliation between all off-target rows and counts.
            validate_result(region, destination, result, api)
    finally:
        subprocess.run(['docker', 'stop', '-t', '5', CONTAINER], capture_output=True)


def summarize(output):
    stats = json.loads((output / 'reference-stats.json').read_text())
    planned = json.loads((output / 'regions.json').read_text())
    batches = []
    for path in sorted(output.glob('*/validated.json')):
        row = json.loads(path.read_text())
        archive = path.parent / 'offtargets.tsv.gz'
        if not archive.exists():
            with (path.parent / 'offtargets.tsv').open('rb') as source, archive.open('wb') as raw:
                with gzip.GzipFile(filename='', mode='wb', compresslevel=6, fileobj=raw, mtime=0) as compressed:
                    shutil.copyfileobj(source, compressed)
        row['raw_offtarget_gzip_bytes'] = archive.stat().st_size
        catalogue = json.loads(gzip.decompress((path.parent / 'catalogue.json.gz').read_bytes()))
        row['input_sha256'] = catalogue['regions'][0]['input_sha256']
        row['catalogue_gzip_sha256'] = digest(path.parent / 'catalogue.json.gz')
        save(path, row)
        batches.append(row)
    primary = [row for row in batches if row['region']['primary_sample']]
    projection = {}
    if primary and sum(row['guides'] for row in primary):
        count = stats['queryable_candidates']
        total_guides = sum(row['guides'] for row in primary)
        projection['queryable_candidates'] = count
        projection['sample_guides'] = total_guides
        projection['sample_10kb_batches'] = len(primary)
        projection['serial_scoring_hours_at_aggregate_sample_rate'] = count * sum(row['seconds'] for row in primary) / total_guides / 3600
        projection['serial_scoring_hours_at_fastest_and_slowest_sample_rate'] = [
            count * rate / 3600 for rate in [min(row['seconds'] / row['guides'] for row in primary if row['guides']),
                                           max(row['seconds'] / row['guides'] for row in primary if row['guides'])]]
        for key in ['json_pretty_bytes', 'json_minified_bytes', 'json_gzip_bytes', 'column_rows_gzip_bytes', 'raw_offtarget_bytes', 'raw_offtarget_gzip_bytes']:
            projection['projected_' + key] = round(count * sum(row[key] for row in primary) / total_guides)
        projection['warning'] = f'Planning extrapolation from {len(primary)} 10 kb samples, not a measured full-genome build or statistical confidence interval; repeats and batch sizes can change throughput and output volume.'
    incomplete = [region['id'] for region in planned if not (output / region['id'] / 'validated.json').exists()]
    comparisons = []
    fields = ['spacer', 'pam', 'mit_specificity', 'cfd_specificity', 'activity_doench2016',
              'exact_matches', 'off_target_count', 'mismatch_counts', 'warnings']
    for small, large in [(1000, 5000), (5000, 10000), (1000, 10000)]:
        paths = [output / f'2L-{length}/catalogue.json.gz' for length in (small, large)]
        if not all(path.exists() for path in paths):
            continue
        guides = [{(guide['start'], guide['strand']): guide for guide in
                   json.loads(gzip.decompress(path.read_bytes()))['regions'][0]['guides']} for path in paths]
        differences = []
        for key, guide in guides[0].items():
            changed = {field: [guide[field], guides[1][key][field]]
                       for field in fields if guide[field] != guides[1][key][field]}
            if changed:
                differences.append(dict(start=key[0], strand=key[1], spacer=guide['spacer'], changes=changed))
        comparisons.append(dict(smaller_bases=small, larger_bases=large, shared_guides=len(guides[0]),
                                changed_guides=len(differences), differences=differences))
    environment = json.loads((output / 'environment.json').read_text())
    save(output / 'summary.json', dict(reference=stats, environment=environment, batches=batches,
                                      benchmark_script_sha256=digest(Path(__file__)), incomplete_batches=incomplete,
                                      projection=projection, nested_batch_consistency=comparisons))
    print('SUMMARY', json.dumps(dict(batches=len(batches), projection=projection)), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'run', 'summarize'])
    parser.add_argument('--data-root', type=Path, default=Path('/Volumes/Thomas/codex/AgamCs-guide-design'))
    parser.add_argument('--output', type=Path)
    parser.add_argument('--scratch', type=Path, default=Path('/Volumes/AgamCsBench/scale-benchmark'))
    parser.add_argument('--job-seconds', type=int, default=240)
    parser.add_argument('--total-seconds', type=int, default=1200)
    parser.add_argument('--cleanup-restored-images', action='store_true')
    args = parser.parse_args()
    output = args.output or args.data_root / 'scale-benchmark'
    if args.mode == 'prepare':
        prepare(args.data_root, output, args.scratch)
    elif args.mode == 'run':
        run(args.data_root, output, args.scratch, args.job_seconds, args.total_seconds, args.cleanup_restored_images)
    else:
        summarize(output)
