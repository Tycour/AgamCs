"""Import pinned CRISPOR NGG-only outputs without recomputing or mixing scores.

Input directory: regions.json and one <id>/{query.fa,guides.tsv,offtargets.tsv,
command.json,complete.json} per interval. Run CRISPOR with --pam NGG --mm 4
--minAltPamScore 101 and a fresh temp directory to exclude alternative PAMs.
"""
from __future__ import annotations
import argparse
import collections
import csv
import hashlib
import json
import re
from pathlib import Path

SCHEMA = 'agamcs-guide-catalogue-v1'
IMAGE = 'sha256:5f4d6c35a67974f012b4d62267174bc15a346b211e86b4426d99bb49de764294'

def reverse_complement(sequence):
    return sequence.translate(str.maketrans('ACGT', 'TGCA'))[::-1]

def number(value):
    try:
        value = float(value)
        return value if value >= 0 and value < float('inf') else None
    except (TypeError, ValueError):
        return None

def read_tsv(path):
    with path.open() as handle:
        return list(csv.DictReader(handle, delimiter='\t'))

def import_region(region, directory):
    sequence = ''.join((directory/'query.fa').read_text().splitlines()[1:]).upper()
    if sequence != region['sequence'] or len(sequence) != region['end']-region['start']+1:
        raise ValueError('Query sequence does not match region manifest')
    rows = read_tsv(directory/'guides.tsv')
    off = read_tsv(directory/'offtargets.tsv')
    counts = collections.defaultdict(collections.Counter)
    ambiguous = collections.Counter()
    for row in off:
        if not re.fullmatch('[ACGTN]{21}GG', row['offtargetSeq']):
            raise ValueError('Off-target output is not NGG-only')
        mismatch = int(row['mismatchCount'])
        if mismatch not in range(5):
            raise ValueError('Unsupported mismatch count')
        counts[row['guideId']][mismatch] += 1
        if 'N' in row['offtargetSeq']:
            ambiguous[row['guideId']] += 1
    guides = []
    previous_score = float('inf')
    for rank, row in enumerate(rows, 1):
        target = row['targetSeq']
        if not re.fullmatch('[ACGT]{21}GG', target):
            raise ValueError('Expected a 20-base spacer plus NGG PAM')
        match = re.fullmatch(r'(\d+)(forw|rev)', row['guideId'])
        if not match:
            raise ValueError('Unknown CRISPOR guide ID convention')
        # CRISPOR exported IDs use a 1-based PAM start on the input forward strand.
        pam_index = int(match[1])-1
        strand = '+' if match[2] == 'forw' else '-'
        offset = pam_index-20 if strand == '+' else pam_index
        observed = sequence[offset:offset+23]
        if strand == '-':
            observed = reverse_complement(observed)
        if offset < 0 or observed != target:
            raise ValueError(f"Guide coordinates fail sequence check: {row['guideId']}")
        start = region['start']+offset
        end = start+22
        spacer_start, spacer_end = (start, end-3) if strand == '+' else (start+3, end)
        pam_start, pam_end = (end-2, end) if strand == '+' else (start, start+2)
        score = number(row['mitSpecScore'])
        if score is not None:
            if score > previous_score:
                raise ValueError('CRISPOR export is not in descending MIT specificity order')
            previous_score = score
        histogram = [counts[row['guideId']][i] for i in range(5)]
        if sum(histogram) != int(row['offtargetCount']):
            raise ValueError('Off-target rows do not reconcile with guide counts')
        # Only infer intended target after sequence verification against the reference query.
        warnings = []
        if ambiguous[row['guideId']]:
            warnings.append(f"{ambiguous[row['guideId']]} off-target rows contain unknown reference bases")
        exact_matches = histogram[0]+1 if score is not None else None
        if exact_matches is not None and exact_matches > 1:
            warnings.append(f'{exact_matches} exact reference matches')
        if score is None:
            warnings.append('Specificity unavailable; match counts may be incomplete')
        if 'TTTT' in target[:20]:
            warnings.append('Poly-T stretch (4+ bases)')
        if row.get('GrafEtAlStatus') not in (None, 'GrafOK'):
            warnings.append({'tt': 'CRISPOR TT-motif warning', 'gcc': 'CRISPOR GCC-motif warning'}.get(row['GrafEtAlStatus'], 'CRISPOR motif warning: '+row['GrafEtAlStatus']))
        guides.append(dict(id=region['id']+':'+row['guideId'], tool_rank=rank,
            chromosome=region['chromosome'], start=start, end=end, strand=strand,
            spacer_start=spacer_start, spacer_end=spacer_end, pam_start=pam_start, pam_end=pam_end,
            spacer=target[:20], pam=target[20:], mit_specificity=score,
            cfd_specificity=number(row['cfdSpecScore']), activity_doench2016=number(row["Doench '16-Score"]),
            exact_matches=exact_matches, off_target_count=sum(histogram), mismatch_counts=histogram,
            gc_percent=100*sum(b in 'GC' for b in target[:20])/20, warnings=warnings))
    expected = set()
    for offset in range(len(sequence)-22):
        segment = sequence[offset:offset+23]
        for strand, target in [('+', segment), ('-', reverse_complement(segment))]:
            if re.fullmatch('[ACGT]{21}GG', target):
                expected.add((region['start']+offset, strand, target))
    actual = {(g['start'], g['strand'], g['spacer']+g['pam']) for g in guides}
    if actual != expected or len(actual) != len(guides):
        raise ValueError('Export does not cover every complete NGG guide in the interval')
    files = ['query.fa', 'guides.tsv', 'offtargets.tsv', 'command.json', 'complete.json']
    return {**{k:v for k,v in region.items() if k != 'sequence'}, 'guides':guides,
        'input_sha256':{name:hashlib.sha256((directory/name).read_bytes()).hexdigest() for name in files}}

def build(source):
    regions = json.loads((source/'regions.json').read_text())
    return dict(schema_version=SCHEMA, assembly='AgamP4', coordinate_convention='1-based inclusive',
        tool='CRISPOR', tool_image=IMAGE, local_image_patch='libmariadb3',
        tool_source_sha256=hashlib.sha256((source/'crispor-source.py').read_bytes()).hexdigest(),
        search_options={'pam':'NGG','mm':4,'minAltPamScore':101,'effScores':'fusi,doench'},
        reference_sha256='dd0d2bf6fd9913a7887873753306bd14db399552a5703a099aea0af055c8b505',
        candidate_pam='NGG', off_target_pams=['NGG'], max_mismatches=4,
        ranking='Native CRISPOR export order: descending MIT specificity; ties retained',
        scope='Prototype intervals only; entire supplied reference searched for off-targets',
        regions=[import_region(region, source/region['id']) for region in regions])

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('--output',type=Path,default=Path('docs/assets/data/guide-catalogue.json'))
    args=parser.parse_args(); data=build(args.source)
    args.output.write_text(json.dumps(data,indent=2)+'\n')
    print(f"Imported {sum(len(r['guides']) for r in data['regions'])} guides across {len(data['regions'])} intervals")
