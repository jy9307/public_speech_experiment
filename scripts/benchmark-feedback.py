"""Run both feedback architectures sequentially on the same local recording.

Uses production model/auth/generation settings, without modifying app data or
registering candidate endpoints. Raw feedback and video stay in ignored results.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import sys
import threading
import time
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
ENGINE = ROOT.parent / 'pub_speak_engine'
sys.path.insert(0, str(ENGINE))
from dotenv import load_dotenv
load_dotenv(ENGINE / '.env')
import main
import experiment as study
import experiment_grouped as grouped
from google.genai import types


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temporary.replace(path)


def check_result(result, duration):
    analysis = result['analysisResult']
    records = analysis['criterionAssessments']
    selected = study.select_assessments(records)
    expected = {row['categoryId']: row['rubricItemId'] for row in selected}
    assert analysis['selectedItemIds'] == expected
    assert analysis['scores'] == {row['rubricItemId']: row['score'] for row in records}
    for category in study.STUDY_CATEGORIES:
        for item in category['items']:
            record = next(row for row in records if row['rubricItemId'] == item['id'])
            feedback = record['feedback']
            assert feedback['title'] == item['label']
            assert 0 <= feedback['seconds'] <= duration
    assert len(result['feedback']) == 3
    for row in result['feedback']:
        assert expected[row['categoryId']] == row['rubricItemId']
        assert 'score' not in row
        assert not re.search(r'점수|등급|(?<!\d)[1-4]\s*점|[1-4]\s*/\s*4', row['text'])
    return {'complete12': True, 'deterministicMinima': True, 'canonicalTitles': True,
            'boundedTimestamps': True, 'noNumericScoreInFeedback': True,
            'semanticAccuracy': 'Not certified by algorithmic checks'}


def run(args, architecture, condition, output):
    label = f'{architecture}-{condition}'
    path = output / f'{label}.json'
    events_path = output / f'{label}-calls.json'
    calls, lock = [], threading.Lock()
    original_json = study._json_call
    original_generate = main.generate_content
    raw_counter = 0
    def capture_generate(*values, **options):
        nonlocal raw_counter
        with lock:
            raw_counter += 1
            sequence = raw_counter
        text = original_generate(*values, **options)
        (output / f'{label}-raw-{sequence:02}.txt').write_text(text)
        return text
    def observed_json(engine, key, model, parts, prompt, system=study.COMMON_RULES, schema=None):
        phase = 'video-category' if prompt.startswith('당신은 발표 영상의 대영역 하나') else 'video-criterion' if parts else 'scope-judge' if prompt.startswith('당신은 발표 피드백의 세부영역 범위') else 'experimental-tone'
        started = time.perf_counter()
        with lock:
            event = {'id': len(calls) + 1, 'phase': phase, 'startedSeconds': started - beginning,
                     'promptCharacters': len(prompt), 'status': 'running'}
            calls.append(event)
            write_json(events_path, calls)
        try:
            value = original_json(engine, key, model, parts, prompt, system, schema=schema)
            event['status'] = 'ok'
            return value
        except Exception as error:
            event['status'] = 'error'
            # No request URL or authentication detail is stored.
            event['errorType'] = type(error).__name__
            raise
        finally:
            with lock:
                event['seconds'] = time.perf_counter() - started
                write_json(events_path, calls)
            print(json.dumps({'run': label, 'call': event['id'], 'phase': phase,
                              'seconds': round(event['seconds'], 2), 'status': event['status']}), flush=True)
    beginning = time.perf_counter()
    uploaded = None
    record = {'architecture': architecture, 'condition': condition, 'status': 'running',
              'startedAt': datetime.now(timezone.utc).isoformat(), 'model': args.model}
    write_json(path, record)
    print(json.dumps({'run': label, 'stage': 'upload-start'}), flush=True)
    client = main.gemini_client()
    try:
        uploaded = client.files.upload(file=str(args.video), config=types.UploadFileConfig(mime_type=args.mime))
        record['uploadSeconds'] = time.perf_counter() - beginning
        while main.state_name(uploaded) == 'PROCESSING':
            if time.perf_counter() - beginning > 360:
                raise TimeoutError('Video processing exceeded benchmark limit')
            time.sleep(3)
            uploaded = client.files.get(name=uploaded.name)
        if main.state_name(uploaded) != 'ACTIVE':
            raise RuntimeError('Video not active')
        record['preprocessingSeconds'] = time.perf_counter() - beginning
        print(json.dumps({'run': label, 'stage': 'analysis-start', 'preprocessingSeconds': round(record['preprocessingSeconds'], 2)}), flush=True)
        study._json_call = observed_json
        engine = {**vars(main), 'generate_content': capture_generate}
        started = time.perf_counter()
        pipeline = study.run_criterion_pipeline if architecture == 'existing' else grouped.run_grouped_pipeline
        try:
            result = pipeline(engine, main.get_gemini_api_key(), args.model,
                              {'uri': uploaded.uri, 'mimeType': args.mime}, args.duration, condition)
        finally:
            record['analysisSeconds'] = time.perf_counter() - started
            study._json_call = original_json
        record['checks'] = check_result(result, args.duration)
        record.update(status='ok', result=result)
    except Exception as error:
        record.update(status='error', errorType=type(error).__name__)
        # These errors are generated by local validators or upstream response
        # messages; omit strings that could include API URLs/secrets.
        if isinstance(error, (ValueError, AssertionError, KeyError)):
            record['error'] = str(error)[:600]
    finally:
        record['totalSeconds'] = time.perf_counter() - beginning
        record['calls'] = calls
        record['callCount'] = len(calls)
        record['videoCalls'] = sum(c['phase'].startswith('video-') for c in calls)
        record['judgeCalls'] = sum(c['phase'] == 'scope-judge' for c in calls)
        write_json(path, record)
        if uploaded:
            try:
                client.files.delete(name=uploaded.name)
            except Exception:
                record['cleanupWarning'] = 'Uploaded benchmark video deletion failed'
                write_json(path, record)
        client.close()
    print(json.dumps({key: record.get(key) for key in ['architecture', 'condition', 'status', 'totalSeconds', 'analysisSeconds', 'callCount', 'errorType', 'error']}), flush=True)
    return record


def main_cli():
    parser = argparse.ArgumentParser()
    parser.add_argument('--video', type=pathlib.Path, required=True)
    parser.add_argument('--duration', type=float, required=True)
    parser.add_argument('--mime', default='video/webm')
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--cells', default='grouped:ctrl,existing:ctrl,existing:exp,grouped:exp')
    args = parser.parse_args()
    args.model = os.getenv('GEMINI_MODEL') or main.DEFAULT_MODEL
    args.output.mkdir(parents=True, exist_ok=True)
    for source in [ENGINE / 'experiment.py', ENGINE / 'experiment_grouped.py', pathlib.Path(__file__)]:
        (args.output / source.name).write_bytes(source.read_bytes())
    metadata = {'videoSha256': hashlib.sha256(args.video.read_bytes()).hexdigest(),
                'videoBytes': args.video.stat().st_size, 'durationSeconds': args.duration,
                'model': args.model, 'rubricVersion': study.RUBRIC_VERSION,
                'workers': os.getenv('STUDY_ANALYSIS_WORKERS', '4'),
                'design': 'Sequential runs, one full independent upload and pipeline per cell; one run per architecture/condition, not a statistical estimate.',
                'startedAt': datetime.now(timezone.utc).isoformat()}
    write_json(args.output / 'metadata.json', metadata)
    records = []
    # Reverse architecture order in the second condition to avoid always giving
    # one architecture first access. Provider load/cache effects remain possible.
    for cell in args.cells.split(','):
        architecture, condition = cell.split(':')
        if architecture not in ('grouped', 'existing') or condition not in ('ctrl', 'exp'):
            raise ValueError('Unknown benchmark cell')
        records.append(run(args, architecture, condition, args.output))
        write_json(args.output / 'summary.json', {'metadata': metadata, 'runs': [{k: v for k, v in record.items() if k != 'result'} for record in records]})


if __name__ == '__main__':
    main_cli()
