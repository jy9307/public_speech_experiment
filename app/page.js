import LoginForm from './components/LoginForm';
import { PRE_SURVEY_URL } from './lib/surveys';
export default function Home() {
  return <main className="entry-page"><section className="entry-card" aria-label="참여자 로그인"><section className="survey-invitation"><h1>발표 연습 시작하기</h1><p>먼저 사전 설문을 작성한 뒤, 안내받은 참여자 아이디로 시작해 주세요.</p><a className="survey-link" href={PRE_SURVEY_URL} target="_blank" rel="noopener noreferrer">사전 설문 참여하기 <span>새 창에서 열기 ↗</span></a></section><LoginForm /></section></main>;
}
