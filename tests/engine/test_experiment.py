import sys
import pathlib
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[3]/'pub_speak_engine'))
from experiment import feedback_prompt, validate_feedback, STUDY_CATEGORIES
from main import app, analyze_category
FEEDBACK_CATEGORIES = STUDY_CATEGORIES

class FeedbackTest(unittest.TestCase):
    def setUp(self):
        self.targets=[{'categoryId':c['id'],'area':c['label'],'rubric':c['items'][1],'observations':[{'seconds':3,'feedback':'관찰된 발표 장면'}]} for c in FEEDBACK_CATEGORIES]
        self.rows={'feedback':[{'categoryId':t['categoryId'],'rubricItemId':t['rubric']['id'],'title':'제목','seconds':3,'summary':'구체적 문제','evidence':'확인한 발화','rationale':'루브릭 평가 이유','suggestion':'핵심 문장을 추가하세요.','strength':'','text':'발표에서 근거가 빠져 내용을 이해하기 어렵습니다. 핵심 문장 뒤에 사례를 추가하세요.'} for t in self.targets]}
    def test_condition_prompts_share_solution_rules(self):
        for condition in ['ctrl','exp']:
            prompt=feedback_prompt(condition,self.targets)
            self.assertIn('Solution',prompt)
            self.assertIn('확인되지 않은',prompt)
        self.assertIn('부드러운 표현은 개선 제안',feedback_prompt('exp',self.targets))
    def test_three_items_and_grounded_timestamps(self):
        valid=validate_feedback(self.rows,self.targets,10,'ctrl')
        self.assertEqual([r['categoryId'] for r in valid],['content','organization','expression'])
        self.rows['feedback'][0]['seconds']=7
        anchored=validate_feedback(self.rows,self.targets,10,'ctrl')
        self.assertEqual(anchored[0]['seconds'],3)
        self.assertEqual(anchored[0]['time'],'00:03')
        with self.assertRaises(ValueError):validate_feedback(self.rows,self.targets,2,'ctrl')
    def test_refuses_missing_solution_and_suggestive_emoji(self):
        self.rows['feedback'][0]['suggestion']=''
        with self.assertRaises(ValueError):validate_feedback(self.rows,self.targets,10,'exp')
        self.rows['feedback'][0]['suggestion']='문장을 추가해 보면 어떨까요? 😉'
        with self.assertRaises(ValueError):validate_feedback(self.rows,self.targets,10,'exp')
    def test_rubric_matches_app_source_and_four_levels(self):
        import json
        source=pathlib.Path(__file__).resolve().parents[2]/'fdb_cat.json'
        self.assertEqual(STUDY_CATEGORIES,[{**c,"items":[i for i in c["items"] if i["id"] not in ("topic_relevance","presentation_materials")]} for c in json.loads(source.read_text())])
        self.assertEqual([c['label'] for c in STUDY_CATEGORIES],['내용','조직','표현 및 전달'])
        self.assertTrue(all(set(item['levels'])=={'1','2','3','4'} for c in STUDY_CATEGORIES for item in c['items']))
    def test_analysis_prompt_includes_level_descriptors_and_uses_four_points(self):
        from unittest.mock import patch
        category=STUDY_CATEGORIES[0]
        with patch('main.generate_content',return_value='{"timestamps":[],"scores":{}}') as generate:
            analyze_category('test','test',{'mimeType':'video/mp4','uri':'test'},category,{},None)
        prompt=generate.call_args.args[2][1]['text']
        self.assertIn(category['items'][0]['levels']['4'],prompt)
        self.assertIn('1~4',prompt)
        self.assertNotIn('1~5',prompt)
        from main import FEEDBACK_CATEGORIES as general_categories
        with patch('main.generate_content',return_value='{"timestamps":[],"scores":{}}') as generate:
            analyze_category('test','test',{'mimeType':'video/mp4','uri':'test'},general_categories[0],{},None)
        self.assertIn('1~5',generate.call_args.args[2][1]['text'])
    def test_labels_are_canonical_and_sections_are_rejected(self):
        self.rows['feedback'][0]['title']='잘못 생성한 루브릭 이름'
        valid=validate_feedback(self.rows,self.targets,10,'ctrl')
        self.assertEqual(valid[0]['title'],self.targets[0]['rubric']['label'])
        self.assertEqual(valid[0]['area'],STUDY_CATEGORIES[0]['label'])
        self.rows['feedback'][0]['text']='루브릭 레벨 3에 해당합니다. 사례를 추가하세요.'
        with self.assertRaises(ValueError):validate_feedback(self.rows,self.targets,10,'ctrl')
        self.rows['feedback'][0]['text']='발표 근거: 문제 설명\n개선 제안: 사례를 추가하세요.'
        with self.assertRaises(ValueError):validate_feedback(self.rows,self.targets,10,'ctrl')
    def test_registered_authenticated_routes(self):
        paths=app.openapi()['paths']
        for path in ['/experiment/feedback/ctrl','/experiment/feedback/exp','/experiment/analyze']:
            self.assertIn(path,paths)

if __name__=='__main__':unittest.main()
