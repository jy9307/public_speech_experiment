import json
import os
import pathlib
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / 'pub_speak_engine'))
from fastapi.testclient import TestClient
import main
import experiment as study
import experiment_grouped as grouped
from experiment_context import normalize_context


class ContextRoutesTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.context = normalize_context({'roundNumber': 2, 'previousRound': {'number': 1, 'feedback': [
            {'categoryId': 'content', 'rubricItemId': 'presentation_content', 'text': '호수 변화라는 주제를 명확하게 설명하세요.'},
        ]}})

    def test_all_routes_dispatch_to_grouped_pipeline_with_context_and_cleanup(self):
        uploaded = SimpleNamespace(state='ACTIVE', uri='test-uri', name='test-file')
        gemini = Mock()
        gemini.files.upload.return_value = uploaded
        with patch.dict(os.environ, {'SPEECH_ENGINE_TOKEN': 'test-token'}), patch.object(main, 'gemini_client', return_value=gemini), patch.object(main, 'get_gemini_api_key', return_value='key'), patch.object(study, 'run_criterion_pipeline', side_effect=AssertionError('Old pipeline')), patch.object(grouped, 'run_grouped_pipeline', return_value={'ok': True}) as run:
            for suffix, condition in [('feedback/ctrl', 'ctrl'), ('feedback/exp', 'exp'), ('analyze', None)]:
                response = self.client.post('/experiment/' + suffix, headers={'Authorization': 'Bearer test-token'}, data={'duration': '20', 'study_context': json.dumps(self.context)}, files={'video': ('video.webm', b'test', 'video/webm')})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(run.call_args.args[-2:], (condition, self.context))
        self.assertEqual(gemini.files.delete.call_count, 3)

    def test_invalid_context_is_rejected_before_video_upload(self):
        bad = {**self.context, 'roundNumber': 4}
        with patch.dict(os.environ, {'SPEECH_ENGINE_TOKEN': 'test-token'}), patch.object(main, 'gemini_client') as client:
            response = self.client.post('/experiment/feedback/ctrl', headers={'Authorization': 'Bearer test-token'}, data={'duration': '20', 'study_context': json.dumps(bad)}, files={'video': ('video.webm', b'test', 'video/webm')})
        self.assertEqual(response.status_code, 400)
        client.assert_not_called()

    def test_bundled_materials_match_app_source(self):
        source = pathlib.Path(__file__).resolve().parents[2] / 'speaking_materials.md'
        self.assertEqual(normalize_context()['materials']['text'], source.read_text())

    def test_generation_protocol_requires_fields_ids_and_bounded_numeric_scores_and_times(self):
        schema = study.assessment_schema(['topic_relevance'], 20)
        self.assertTrue({'score', 'seconds', 'summary', 'evidence', 'rationale', 'suggestion', 'text'}.issubset(schema['required']))
        self.assertEqual(schema['properties']['seconds'], {'type': 'number', 'minimum': 0, 'maximum': 20})
        self.assertEqual(schema['properties']['score']['maximum'], 4)
        response = Mock(ok=True, content=b'json')
        response.json.return_value = {'candidates': [{'content': {'parts': [{'text': '{"ok":true}'}]}}]}
        with patch.object(main.requests, 'post', return_value=response) as post:
            main.generate_content('key', 'model', [], response_schema=schema)
        self.assertEqual(post.call_args.kwargs['json']['generationConfig']['responseFormat']['text']['schema'], schema)
        self.assertEqual(post.call_args.kwargs['json']['generationConfig']['responseFormat']['text']['mimeType'], 'APPLICATION_JSON')
        with patch.object(main.requests, 'post', return_value=response) as post:
            main.generate_content('key', 'gemini-2.5-flash', [], response_schema=schema)
        self.assertEqual(post.call_args.kwargs['json']['generationConfig'], {'responseMimeType': 'application/json', 'responseJsonSchema': schema})


if __name__ == '__main__':
    unittest.main()
