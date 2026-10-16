import json
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / 'pub_speak_engine'))
import experiment as study
import experiment_grouped as grouped
import test_criterion_pipeline as fixtures


class GroupedPipelineTest(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.CriterionPipelineTest()
        self.fixture.setUp()
        self.fixture.engine['extract_json'] = lambda text: text
        self.categories = []

    def fake_json(self, engine, api_key, model, parts, prompt, system=study.COMMON_RULES, schema=None):
        if prompt.startswith('당신은 발표 영상의 대영역 하나'):
            category = next(c for c in study.STUDY_CATEGORIES if f"(id={c['id']})" in prompt)
            self.categories.append(category['id'])
            return {'assessments': [self.fixture.packet(item) for item in category['items']]}
        return self.fixture.fake_json(engine, api_key, model, parts, prompt, system)

    def run_pipeline(self, condition='ctrl'):
        return grouped.run_grouped_pipeline(self.fixture.engine, 'key', 'model', {'uri': 'test'}, 20, condition)

    def test_three_video_calls_produce_all_ten_records_without_ai_judge(self):
        with patch.object(study, '_json_call', side_effect=self.fake_json), patch.object(study, '_verify_scope', side_effect=AssertionError('No AI judge')):
            result = self.run_pipeline()
        self.assertCountEqual(self.categories, ['content', 'organization', 'expression'])
        self.assertEqual(len(result['analysisResult']['criterionAssessments']), 10)
        self.assertEqual(result['analysisResult']['scores'], self.fixture.scores)
        self.assertEqual([f['rubricItemId'] for f in result['feedback']], [c['items'][1]['id'] for c in study.STUDY_CATEGORIES])
        self.assertFalse(result['analysisResult']['validation']['semanticScopeVerified'])

    def test_only_invalid_or_missing_item_gets_independent_repair(self):
        target = study.STUDY_CATEGORIES[0]['items'][0]['id']
        def malformed(*args, **kwargs):
            raw = self.fake_json(*args, **kwargs)
            for row in raw.get('assessments', []):
                if row['rubricItemId'] == target:
                    row['score'] = True
            return raw
        with patch.object(study, '_json_call', side_effect=malformed):
            result = self.run_pipeline()
        self.assertEqual(self.fixture.counts, {target: 1})
        self.assertEqual(len(result['analysisResult']['validation']['structuralRepairs']), 1)

    def test_exp_style_cannot_modify_scores_and_uses_three_selected_sources(self):
        def style(e, k, m, assessment, duration, context=None):
            output = dict(assessment['feedback'])
            output['text'] = '관찰된 행동을 수정해서 연습해 보면 어떨까요?'
            return output
        with patch.object(study, '_json_call', side_effect=self.fake_json), patch.object(study, '_style_criterion', side_effect=style) as writer, patch.object(study, '_verify_scope', side_effect=AssertionError('No AI judge')):
            result = self.run_pipeline('exp')
        self.assertEqual(writer.call_count, 3)
        self.assertEqual(result['analysisResult']['scores'], self.fixture.scores)
        self.assertTrue(all('score' not in row for row in result['feedback']))

    def test_context_is_available_to_category_repair_and_style_without_cross_area_history(self):
        from experiment_context import normalize_context
        context = normalize_context({'roundNumber': 2, 'previousRound': {'number': 1, 'feedback': [
            {'categoryId': 'content', 'rubricItemId': self.fixture.ids[0], 'text': '내용 전용 이전 피드백'},
            {'categoryId': 'organization', 'rubricItemId': self.fixture.ids[3], 'text': '조직 전용 이전 피드백'},
        ]}})
        content = study.STUDY_CATEGORIES[0]
        prompt = grouped.category_prompt(content, 20, context)
        self.assertIn(json.dumps(context['materials']['text'], ensure_ascii=False)[1:-1], prompt)
        self.assertIn('내용 전용 이전 피드백', prompt)
        self.assertNotIn('조직 전용 이전 피드백', prompt)
        repair = study.criterion_prompt(content, content['items'][0], 20, context=context)
        self.assertIn('내용 전용 이전 피드백', repair)
        different = study.criterion_prompt(content, content['items'][1], 20, context=context)
        self.assertNotIn('내용 전용 이전 피드백', different)
        with patch.object(study, '_json_call', side_effect=self.fake_json):
            result = grouped.run_grouped_pipeline(self.fixture.engine, 'key', 'model', {'uri': 'test'}, 20, 'ctrl', context)
        self.assertEqual(result['analysisResult']['context'], context)

    def test_context_rejects_wrong_round_checksum_and_drops_unapproved_prior_fields(self):
        from experiment_context import normalize_context
        with self.assertRaises(ValueError):
            normalize_context({'roundNumber': 1, 'previousRound': {'number': 0, 'feedback': []}})
        with self.assertRaises(ValueError):
            normalize_context({'roundNumber': 3, 'previousRound': {'number': 1, 'feedback': []}})
        with self.assertRaises(ValueError):
            normalize_context({'materials': {'text': '자료', 'sha256': 'wrong'}})
        context = normalize_context({'roundNumber': 2, 'previousRound': {'number': 1, 'feedback': [
            {'categoryId': 'content', 'rubricItemId': None, 'text': '이전 피드백', 'score': 1, 'participantId': 'other'},
        ]}})
        self.assertEqual(set(context['previousRound']['feedback'][0]), {'categoryId', 'rubricItemId', 'text'})

    def test_unknown_item_is_rejected_after_bounded_retry(self):
        with patch.object(study, '_json_call', return_value={'assessments': [{'rubricItemId': 'invented'}]}) as generate:
            with self.assertRaisesRegex(ValueError, 'Unknown rubric'):
                self.run_pipeline()
        self.assertEqual(generate.call_count, 6)

    def test_valid_json_array_root_is_preserved_and_accepted(self):
        text = '[{"rubricItemId":"a"},{"rubricItemId":"b"}]'
        self.assertEqual(grouped.preserve_json_root(text, lambda value: 'wrong'), text)
        def arrays(*args, **kwargs):
            return self.fake_json(*args, **kwargs)['assessments']
        with patch.object(study, '_json_call', side_effect=arrays):
            result = self.run_pipeline()
        self.assertEqual(len(result['analysisResult']['criterionAssessments']), 10)

    def test_explicit_intervals_are_normalized_without_guessing_bad_units(self):
        for value, start in [('2:38-2:46', 158), ([0, 272.381], 0), ('01:23', 83), ('83', 83)]:
            row, interval = grouped.normalize_observation({'seconds': value}, 272.381)
            self.assertEqual(row['seconds'], start)
            self.assertEqual(interval['original'], value)
        category = study.STUDY_CATEGORIES[0]
        assessed = study.validate_assessment({**self.fixture.packet(category['items'][0]), 'seconds': '00:03-00:04'}, category, category['items'][0], 20)
        self.assertEqual(assessed['feedback']['seconds'], 3)
        self.assertEqual(assessed['observationTimeNormalization']['original'], '00:03-00:04')
        for value in ['4:31-5:00', [10, 3], [False, 1], '1:99', 'unknown']:
            with self.assertRaises(ValueError):
                grouped.normalize_observation({'seconds': value}, 272.381)
        row, _ = grouped.normalize_observation({'seconds': 421}, 272.381)
        self.assertEqual(row['seconds'], 421)
        category = study.STUDY_CATEGORIES[0]
        with self.assertRaises(ValueError):
            study.validate_assessment({**self.fixture.packet(category['items'][0]), **row}, category, category['items'][0], 272.381)


if __name__ == '__main__':
    unittest.main()
