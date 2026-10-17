import importlib.util
import json
import csv
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('guide_catalogue',ROOT/'tools/build_guide_catalogue.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class CatalogueTests(unittest.TestCase):
    def test_scores_do_not_turn_unavailable_into_zero(self):
        for value in ['NotEnoughFlankSeq','-1','NaN','inf','',None]:
            self.assertIsNone(module.number(value))
        self.assertEqual(module.number('0'),0)

    def fixture(self, directory, reverse=False, ambiguous=False):
        sequence = 'CCA'+'T'*20 if reverse else 'A'*20+'TGG'
        (directory/'query.fa').write_text('>fixture\n'+sequence+'\n')
        row = {'guideId':'1rev' if reverse else '21forw', 'targetSeq':'A'*20+'TGG',
            'mitSpecScore':'99', 'cfdSpecScore':'98', "Doench '16-Score":'50',
            'offtargetCount':'1' if ambiguous else '0', 'GrafEtAlStatus':'GrafOK'}
        with (directory/'guides.tsv').open('w') as handle:
            writer=csv.DictWriter(handle,fieldnames=list(row),delimiter='\t');writer.writeheader();writer.writerow(row)
        with (directory/'offtargets.tsv').open('w') as handle:
            fields=['guideId','offtargetSeq','mismatchCount'];writer=csv.DictWriter(handle,fieldnames=fields,delimiter='\t');writer.writeheader()
            if ambiguous:writer.writerow(dict(guideId=row['guideId'],offtargetSeq='N'*4+'A'*16+'TGG',mismatchCount='4'))
        for filename in ['command.json','complete.json']:(directory/filename).write_text('{}')
        return dict(id='fixture',chromosome='2L',start=100,end=122,sequence=sequence)

    def test_importer_verifies_both_strands_against_reference_and_complete_enumeration(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)
            for reverse in [False,True]:
                region=self.fixture(directory,reverse=reverse)
                g=module.import_region(region,directory)['guides'][0]
                self.assertEqual((g['start'],g['end']),(100,122))
                self.assertEqual(g['pam_start'],100 if reverse else 120)
                self.assertEqual(g['spacer_start'],103 if reverse else 100)
                self.assertEqual(g['exact_matches'],1)
            region['sequence']='G'+region['sequence'][1:]
            with self.assertRaisesRegex(ValueError,'sequence'):module.import_region(region,directory)

    def test_unknown_reference_hits_retained_and_warned_but_alternative_pams_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp);region=self.fixture(directory,ambiguous=True)
            g=module.import_region(region,directory)['guides'][0]
            self.assertEqual(g['off_target_count'],1)
            self.assertTrue(any('unknown reference' in warning for warning in g['warnings']))
            p=directory/'offtargets.tsv';p.write_text(p.read_text().replace('TGG','TAG'))
            with self.assertRaisesRegex(ValueError,'NGG-only'):module.import_region(region,directory)

    def test_catalogue_sequence_geometry_and_scores(self):
        catalogue=json.loads((ROOT/'docs/assets/data/guide-catalogue.json').read_text())
        for region in catalogue['regions']:
            for guide in region['guides']:
                self.assertEqual(guide['end']-guide['start']+1,23)
                self.assertEqual(len(guide['spacer']),20)
                self.assertTrue(guide['pam'].endswith('GG'))
                self.assertEqual(sum(guide['mismatch_counts']),guide['off_target_count'])
                self.assertGreaterEqual(guide['start'],region['start'])
                self.assertLessEqual(guide['end'],region['end'])
                self.assertEqual(guide['spacer_end']-guide['spacer_start']+1,20)
                self.assertEqual(guide['pam_end']-guide['pam_start']+1,3)

if __name__=='__main__':unittest.main()
