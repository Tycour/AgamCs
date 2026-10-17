import importlib.util
import csv
import gzip
import hashlib
import json
import random
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'tools/benchmark_guide_scale.py'
spec = importlib.util.spec_from_file_location('guide_scale', SOURCE)
scale = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scale)


class GuideScaleTests(unittest.TestCase):
    def test_counts_match_independent_enumeration_with_unknowns_and_tile_edges(self):
        rng = random.Random(42)
        sequences = [b'G' * 50, b'C' * 50, b'A' * 20 + b'TGG', b'CCA' + b'T' * 20,
                     b'A' * 20 + b'NGG', b'GGNCC', b'ACGTN']
        sequences += [''.join(rng.choices('ACGTN', weights=[3, 3, 3, 3, 1], k=300)).encode()
                      for _ in range(20)]
        for sequence in sequences:
            expected = {'+': 0, '-': 0}
            tiles = [0] * ((len(sequence) + 9) // 10)
            for start in range(len(sequence) - 22):
                target = sequence[start:start + 23]
                if set(target) - set(b'ACGT'):
                    continue
                for strand, valid in [('+', target[-2:] == b'GG'), ('-', target[:2] == b'CC')]:
                    if valid:
                        expected[strand] += 1
                        tiles[start // 10] += 1
            self.assertEqual(scale.candidate_counts(sequence, tile_size=10), (expected, tiles))

    def test_indexed_extraction_preserves_bases_across_fasta_line_breaks(self):
        with tempfile.TemporaryDirectory() as temporary:
            fasta = Path(temporary) / 'reference.fa'
            fasta.write_bytes(b'>chr\nACGT\nTGCA\nCCGG\n')
            index = {'chr': (12, 5, 4, 5)}
            self.assertEqual(scale.indexed_sequence(fasta, index, 'chr', 3, 10), 'GTTGCACC')
            self.assertEqual(scale.indexed_sequence(fasta, index, 'chr', 1, 12), 'ACGTTGCACCGG')

    def test_successful_process_can_be_validated_without_rerunning_and_keeps_provenance(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            sequence = 'A' * 20 + 'TGG'
            region = dict(id='fixture', chromosome='2L', start=100, end=122, sequence=sequence)
            (directory / 'query.fa').write_text('>fixture\n' + sequence + '\n')
            row = {'guideId': '21forw', 'targetSeq': sequence, 'mitSpecScore': '99',
                   'cfdSpecScore': '98', "Doench '16-Score": '50', 'offtargetCount': '0', 'GrafEtAlStatus': 'GrafOK'}
            with (directory / 'guides.tsv').open('w') as handle:
                writer = csv.DictWriter(handle, fieldnames=list(row), delimiter='\t')
                writer.writeheader()
                writer.writerow(row)
            (directory / 'offtargets.tsv').write_text('guideId\tofftargetSeq\tmismatchCount\n')
            (directory / 'command.json').write_text('[]')
            result = dict(seconds=1, exit_code=0, stop_reason=None)
            scale.validate_result(region, directory, result, scale.importer())
            catalogue = json.loads(gzip.decompress((directory / 'catalogue.json.gz').read_bytes()))
            self.assertEqual(catalogue['regions'][0]['input_sha256']['complete.json'],
                             hashlib.sha256((directory / 'complete.json').read_bytes()).hexdigest())
            self.assertEqual(result['guides'], 1)
            self.assertTrue((directory / 'validated.json').exists())


if __name__ == '__main__':
    unittest.main()
