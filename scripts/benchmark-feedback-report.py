"""Build an offline researcher report from actual benchmark artifacts."""
import csv
import html
import json
import pathlib
import sys

directory = pathlib.Path(sys.argv[1])
summary = json.loads((directory / 'summary.json').read_text())
runs = [json.loads((directory / f"{row['architecture']}-{row['condition']}.json").read_text()) for row in summary['runs']]
metadata = summary['metadata']
labels = {'existing': '기존: 12개 개별 평가 + AI 검증', 'grouped': '대안: 3개 묶음 평가 + 알고리즘 검증'}
conditions = {'ctrl': '통제', 'exp': '실험'}
def esc(value):
    return html.escape(str(value))
def elapsed(value):
    if value is None:
        return '—'
    return f'{int(value)//60}분 {value%60:04.1f}초'

fields = ['architecture', 'condition', 'status', 'uploadSeconds', 'preprocessingSeconds', 'analysisSeconds', 'totalSeconds', 'callCount', 'videoCalls', 'judgeCalls']
with (directory / 'timing.csv').open('w') as output:
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(runs)

table = ''.join(f"<tr><td>{esc(labels[r['architecture']])}</td><td>{conditions[r['condition']]}</td><td>{esc(r['status'])}</td><td>{elapsed(r.get('preprocessingSeconds'))}</td><td>{elapsed(r.get('analysisSeconds'))}</td><td><strong>{elapsed(r.get('totalSeconds'))}</strong></td><td>{r['videoCalls']} / {r['judgeCalls']} / {r['callCount']}</td></tr>" for r in runs)
comparisons = []
for condition in ['ctrl', 'exp']:
    pair = {r['architecture']: r for r in runs if r['condition'] == condition and r['status'] == 'ok'}
    if len(pair) == 2:
        old, new = pair['existing']['totalSeconds'], pair['grouped']['totalSeconds']
        comparisons.append(f"<li>{conditions[condition]} 조건: 대안의 전체 시간이 기존보다 {abs(old-new):.1f}초 {'짧음' if old>new else '김'} ({abs(old-new)/old*100:.1f}%).</li>")

details = []
for run in runs:
    heading = f"{labels[run['architecture']]} / {conditions[run['condition']]}"
    if run['status'] != 'ok':
        details.append(f"<section><h2>{esc(heading)}</h2><p>실패: {esc(run.get('errorType'))} {esc(run.get('error',''))}. 실패 소요 시간은 성공 응답 속도로 해석할 수 없습니다.</p></section>")
        continue
    result = run['result']
    analysis = result['analysisResult']
    records = analysis['criterionAssessments']
    feedback = ''.join(f"<article><h3>{esc(f['area'])}: {esc(f['title'])}</h3><p>{esc(f['text'])}</p><small>관찰 시각: {esc(f['time'])}</small></article>" for f in result['feedback'])
    rows = ''.join(f"<tr><td>{esc(a['feedback']['area'])}</td><td>{esc(a['feedback']['title'])}</td><td>{a['score']}</td><td>{'선정' if analysis['selectedItemIds'].get(a['categoryId'])==a['rubricItemId'] else ''}</td><td>{esc(a['feedback']['text'])}</td></tr>" for a in records)
    checks = '<p>형식 검사 통과: 12개 항목 완비, 최저점 선정 일치, 원본 루브릭 명칭 일치, 시각 범위 일치, 표시 피드백에 숫자 점수 없음.</p>'
    if run.get('qualitativeFindings'):
        checks += '<aside><strong>반환 텍스트 검토</strong><ul>' + ''.join(f'<li>{esc(finding)}</li>' for finding in run['qualitativeFindings']) + '</ul></aside>'
    reports = analysis.get('scopeReports', [])
    if reports:
        checks += '<p>AI 의미 검증 기록: ' + '; '.join(f"{esc(report['stage'])} — {len(report['checks'])}개 중 {sum(not(c['inScope'] and c['grounded']) for c in report['checks'])}개 수정 필요" for report in reports) + '.</p>'
    else:
        checks += '<p>AI 의미 검증 미사용. 알고리즘 검사는 영역 혼합 여부나 영상 관찰의 사실성을 인증하지 않습니다.</p>'
    trace = ''.join(f"<tr><td>{c['id']}</td><td>{esc(c['phase'])}</td><td>{c['startedSeconds']:.1f}</td><td>{c.get('seconds',0):.1f}</td><td>{esc(c['status'])}</td></tr>" for c in run['calls'])
    details.append(f"<section><h2>{esc(heading)}</h2>{checks}{feedback}<details><summary>내부 평가 12개 보기 — 연구자용 점수 포함</summary><table><thead><tr><th>대영역</th><th>세부영역</th><th>점수</th><th>대표</th><th>피드백</th></tr></thead><tbody>{rows}</tbody></table></details><details><summary>호출별 시간 기록 보기</summary><table><tr><th>번호</th><th>역할</th><th>시작(초)</th><th>소요(초)</th><th>상태</th></tr>{trace}</table></details></section>")

score_rows = []
for run in runs:
    if run['status'] == 'ok':
        for a in run['result']['analysisResult']['criterionAssessments']:
            score_rows.append({'architecture': run['architecture'], 'condition': run['condition'], 'rubricItemId': a['rubricItemId'], 'score': a['score'], 'selected': run['result']['analysisResult']['selectedItemIds'].get(a['categoryId']) == a['rubricItemId'], 'text': a['feedback']['text']})
if score_rows:
    with (directory / 'assessments.csv').open('w') as output:
        writer = csv.DictWriter(output, fieldnames=list(score_rows[0]))
        writer.writeheader()
        writer.writerows(score_rows)

notes = ''.join(f'<li>{esc(note)}</li>' for note in metadata.get('notes', []))
page = f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>발표 피드백 구조 비교</title><style>body{{max-width:1200px;margin:36px auto;padding:0 20px;font:16px/1.7 system-ui;color:#182333;background:#f5f7fb}}section{{background:white;padding:24px;margin:24px 0;border:1px solid #dbe2ed;border-radius:12px}}h1{{font-size:28px}}h2{{font-size:22px}}h3{{font-size:18px}}table{{width:100%;border-collapse:collapse;font-size:14px}}td,th{{padding:10px;border-bottom:1px solid #dbe2ed;text-align:left;vertical-align:top}}article{{padding:12px 18px;margin:14px 0;background:#f2f6fc;border-radius:8px}}summary{{cursor:pointer;padding:14px 0;font-weight:600}}small{{color:#526174}}.scroll{{overflow-x:auto}}</style><h1>발표 피드백 구조 비교</h1><p>영상: 오늘 오전 촬영, {elapsed(metadata['durationSeconds'])}, {metadata['videoBytes']/1024/1024:.1f} MiB. 모델: {esc(metadata['model'])}. 표의 각 구조와 조건별 1회 실행.</p><section><h2>실측 시간</h2><div class="scroll"><table><tr><th>구조</th><th>조건</th><th>상태</th><th>업로드 + 영상 준비</th><th>분석</th><th>전체</th><th>영상 / AI 검증 / 전체 호출</th></tr>{table}</table></div><ul>{''.join(comparisons)}</ul><p>전체 시간은 SDK 클라이언트 준비, 별도 업로드, 영상 처리 대기와 피드백 완료 또는 실패까지 포함합니다. DB 다운로드, 브라우저 업로드, 대기열, 업로드 파일 정리 시간은 제외합니다. 호출별 시간은 병렬 실행이므로 합산하면 전체 시간과 다릅니다. 실패 시간은 성공 응답 시간과 같은 의미로 비교할 수 없습니다.</p></section><section><h2>해석 범위</h2><p>동일 영상, 모델, 루브릭, 병렬 작업자 설정을 사용했습니다. 각 실행은 순차로 진행하고 영상을 별도로 업로드했습니다. 공급자 부하, 비공개 캐시와 생성 변동은 통제하지 못합니다. 표의 각 칸은 1회 측정한 값이며 평균 성능이나 품질 우위를 뜻하지 않습니다.</p><ul>{notes}</ul><p>두 구조는 평가 묶음과 AI 검증 여부가 함께 다릅니다. 시간 차이를 AI 검증 제거만의 효과로 해석할 수 없습니다. 점수와 선정 항목 차이는 평가 변동을 나타내며 정확도의 우열을 뜻하지 않습니다. 기존 AI 검증도 생성된 텍스트를 확인하며 실제 영상 사실성을 인증하지 않습니다.</p><p>기존 앱 경로와 참여자 기록은 변경하지 않았습니다. 아래 점수는 연구자용 비교 자료이며 학습자 화면에는 공개하지 않습니다.</p></section>{''.join(details)}<p><small>원본 실행 기록: summary.json, 각 구조와 조건의 JSON, timing.csv, assessments.csv. 영상 SHA-256: {esc(metadata['videoSha256'])}</small></p></html>'''
(directory / 'report.html').write_text(page)
print(str(directory / 'report.html'))
