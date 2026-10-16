"""Rubric provenance across evaluation, repair and final feedback prompts."""
import json
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / 'pub_speak_engine'))
import experiment as study
import experiment_grouped as grouped
import test_criterion_pipeline as fixtures


class RubricPromptTest(unittest.TestCase):
    def test_grouped_and_repair_prompts_receive_original_rubric_without_added_boundaries(self):
        canonical = json.loads((pathlib.Path(__file__).resolve().parents[2] / 'fdb_cat.json').read_text())
        canonical = [{**c,"items":[i for i in c["items"] if i["id"] not in study.EXCLUDED_RUBRIC_IDS]} for c in canonical]
        self.assertEqual(study.STUDY_CATEGORIES, canonical)
        for category in canonical:
            prompt = grouped.category_prompt(category, 300)
            self.assertIn(json.dumps(category['items'], ensure_ascii=False), prompt)
            self.assertNotIn('boundary', prompt)
            for item in category['items']:
                repair = study.criterion_prompt(category, item, 300, 'format repair')
                self.assertIn(item['desc'], repair)
                self.assertIn(json.dumps(item['levels'], ensure_ascii=False), repair)
                self.assertIn('별도의 평가 기준이나 필수 수행 조건을 추가하지 마세요', repair)
                self.assertNotIn('영역 경계:', repair)

    def test_exp_style_receives_full_selected_rubric_and_preserves_its_judgment(self):
        fixture = fixtures.CriterionPipelineTest()
        fixture.setUp()
        for category, item in fixture.specs:
            assessment = study.validate_assessment(fixture.packet(item), category, item, 20)
            def generate(engine, key, model, parts, prompt, **kwargs):
                self.assertEqual(parts, [])
                self.assertIn(json.dumps(item, ensure_ascii=False), prompt)
                self.assertIn('말투를 바꾸면서 루브릭 판단을 바꾸거나', prompt)
                self.assertIn('별도의 평가 기준이나 필수 수행 조건을 추가하지 마세요', prompt)
                return {'feedback': [dict(assessment['feedback'])]}
            with patch.object(study, '_json_call', side_effect=generate):
                output = study._style_criterion(fixture.engine, 'key', 'model', assessment, 20)
            self.assertEqual(output['rubricItemId'], item['id'])

    def test_scene_clock_in_learner_text_is_rejected_and_comparison_stays_private(self):
        fixture = fixtures.CriterionPipelineTest(); fixture.setUp()
        category,item = fixture.specs[0]
        packet = fixture.packet(item)
        packet['previousComparison'] = '이번 영상에서도 같은 관찰이 확인됩니다.'
        result = study.validate_assessment(packet,category,item,20)
        self.assertEqual(result['previousComparison'],packet['previousComparison'])
        self.assertNotIn('previousComparison',result['feedback'])
        packet['text'] = '00:03에서 관찰한 문제를 개선하세요.'
        with self.assertRaises(ValueError): study.validate_assessment(packet,category,item,20)

    def test_excluded_criteria_are_absent_from_all_study_groups(self):
        ids = [item['id'] for c in study.STUDY_CATEGORIES for item in c['items']]
        self.assertEqual(len(ids),10)
        self.assertFalse(set(ids) & set(study.EXCLUDED_RUBRIC_IDS))
