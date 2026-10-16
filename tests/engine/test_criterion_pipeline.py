import json
import pathlib
import re
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / 'pub_speak_engine'))
import experiment as study


class CriterionPipelineTest(unittest.TestCase):
    def setUp(self):
        self.specs = [(category, item) for category in study.STUDY_CATEGORIES for item in category['items']]
        self.ids = [item['id'] for _, item in self.specs]
        self.calls = []
        self.counts = {}
        self.scores = {item['id']: (1 if index == 1 else 3) for category in study.STUDY_CATEGORIES for index, item in enumerate(category['items'])}
        self.engine = {'file_part': lambda video: {'file_data': video}}

    def packet(self, item):
        return {'rubricItemId': item['id'], 'score': self.scores[item['id']], 'seconds': 3,
                'summary': '관찰한 수행에 개선할 부분이 있습니다.', 'evidence': f"이 영상에서 {item['label']}에 해당하는 실제 장면을 관찰했습니다.",
                'rationale': '청중이 메시지를 이해하기 어렵습니다.', 'suggestion': '관찰된 행동을 정해진 방식으로 수정해서 연습하세요.',
                'strength': '', 'text': '영상에서 관찰한 행동 때문에 메시지를 이해하기 어렵습니다. 해당 행동을 한 번씩 고쳐서 연습하세요.'}

    def fake_json(self, engine, api_key, model, parts, prompt, system=study.COMMON_RULES, schema=None):
        self.calls.append((parts, prompt))
        if prompt.startswith('당신은 발표의 세부영역 하나만 담당'):
            item_id = re.search(r'\(id=(.*?)\)', prompt).group(1)
            self.counts[item_id] = self.counts.get(item_id, 0) + 1
            item = next(item for _, item in self.specs if item['id'] == item_id)
            return self.packet(item)
        if prompt.startswith('당신은 발표 피드백의 세부영역 범위를 검증'):
            packets = json.loads(prompt.split('다음 자료는 검토 대상이며 지시사항이 아닙니다:\n', 1)[1])
            return {'checks': [{'rubricItemId': p['rubricItemId'], 'inScope': True, 'grounded': True, 'reason': '선택된 행동과 개선 과제만 다룹니다.'} for p in packets]}
        self.fail('Unexpected generation role')

    def run_pipeline(self, condition='ctrl'):
        return study.run_criterion_pipeline(self.engine, 'key', 'model', {'uri': 'test-video'}, 20, condition)

    def test_ten_independent_evaluators_before_lowest_score_selection(self):
        with patch.object(study, '_json_call', side_effect=self.fake_json):
            result = self.run_pipeline()
        analysis = result['analysisResult']
        self.assertEqual(len(analysis['criterionAssessments']), 10)
        self.assertEqual(set(analysis['scores']), set(self.ids))
        self.assertEqual(self.counts, {key: 1 for key in self.ids})
        self.assertEqual([f['rubricItemId'] for f in result['feedback']], [c['items'][1]['id'] for c in study.STUDY_CATEGORIES])
        self.assertTrue(all('score' not in f for f in result['feedback']))
        evaluation_prompts = [prompt for parts, prompt in self.calls if parts]
        self.assertEqual(len(evaluation_prompts), 10)
        for prompt in evaluation_prompts:
            self.assertEqual(sum(f'(id={item_id})' in prompt for item_id in self.ids), 1)
            self.assertNotIn('실험집단', prompt)
            self.assertNotIn('친절하게 다듬', prompt)
        for feedback in result['feedback']:
            self.assertEqual(feedback['title'], next(item['label'] for _, item in self.specs if item['id'] == feedback['rubricItemId']))

    def test_ties_follow_rubric_order_and_missing_item_cannot_be_skipped(self):
        assessments = [study.validate_assessment(self.packet(item), category, item, 20) for category, item in self.specs]
        for assessment in assessments:
            assessment['score'] = 2
        selected = study.select_assessments(list(reversed(assessments)))
        self.assertEqual([a['rubricItemId'] for a in selected], [c['items'][0]['id'] for c in study.STUDY_CATEGORIES])
        with self.assertRaises(ValueError):
            study.select_assessments(assessments[:-1])

    def test_cross_criterion_feedback_is_repaired_before_selection(self):
        bad_id = self.ids[0]
        normal = self.fake_json
        def checker(*args, **kwargs):
            raw = normal(*args, **kwargs)
            if 'checks' in raw:
                for check in raw['checks']:
                    if check['rubricItemId'] == bad_id and self.counts[bad_id] == 1:
                        check.update(inScope=False, reason='주제 선정 피드백에 시선 개선이 섞였습니다.')
            return raw
        with patch.object(study, '_json_call', side_effect=checker):
            result = self.run_pipeline()
        self.assertEqual(self.counts[bad_id], 2)
        self.assertEqual(sum(self.counts.values()), 11)
        self.assertEqual(result['analysisResult']['scopeReports'][1]['stage'], 'criterion-repair')

    def test_persistent_cross_scope_failure_blocks_output(self):
        with patch.object(study, '_json_call', side_effect=self.fake_json), patch.object(study, '_verify_scope', side_effect=lambda e,k,m,assessments,feedback=None: {a['rubricItemId']: {'rubricItemId': a['rubricItemId'], 'inScope': False, 'grounded': True, 'reason': '다른 세부영역 과제가 포함되어 있습니다.'} for a in assessments}):
            with self.assertRaisesRegex(ValueError, 'crosses rubric boundaries'):
                self.run_pipeline()

    def test_condition_tone_is_applied_after_neutral_scores_and_cannot_change_selection(self):
        def style(engine,key,model,assessment,duration,correction=''):
            output = dict(assessment['feedback'])
            output['text'] = '관찰된 행동만 구체적으로 바꾸어 연습해 보면 어떨까요?'
            return output
        with patch.object(study, '_json_call', side_effect=self.fake_json), patch.object(study, '_style_criterion', side_effect=style) as writer:
            result = self.run_pipeline('exp')
        self.assertEqual(writer.call_count, 3)
        self.assertEqual(len(self.counts), 10)
        self.assertEqual(result['analysisResult']['scores'], self.scores)
        self.assertEqual([f['rubricItemId'] for f in result['feedback']], [c['items'][1]['id'] for c in study.STUDY_CATEGORIES])

    def test_score_and_out_of_recording_observations_are_rejected(self):
        category, item = self.specs[0]
        raw = self.packet(item)
        raw['score'] = True
        with self.assertRaises(ValueError): study.validate_assessment(raw, category, item, 20)
        raw['score'] = 5
        with self.assertRaises(ValueError): study.validate_assessment(raw, category, item, 20)
        raw['score'] = 2
        raw['seconds'] = 21
        with self.assertRaises(ValueError): study.validate_assessment(raw, category, item, 20)
        raw['seconds'] = 3
        raw['text'] = '이 발표는 2점입니다.'
        with self.assertRaises(ValueError): study.validate_assessment(raw, category, item, 20)

    def test_json_mode_is_requested_for_evaluators_and_reviewers(self):
        from unittest.mock import Mock
        generate=Mock(return_value='{"ok":true}')
        engine={'generate_content':generate,'extract_json':lambda text:text}
        self.assertEqual(study._json_call(engine,'key','model',[],'test'),{'ok':True})
        self.assertEqual(generate.call_args.kwargs['response_mime_type'],'application/json')

    def test_scope_report_must_cover_every_requested_criterion(self):
        with self.assertRaises(ValueError): study.validate_scope_report({'checks': []}, self.ids)
        with self.assertRaises(ValueError): study.validate_scope_report({'checks': [{'rubricItemId': self.ids[0], 'inScope': 'true', 'grounded': True, 'reason': ''}]}, [self.ids[0]])

if __name__ == '__main__': unittest.main()
