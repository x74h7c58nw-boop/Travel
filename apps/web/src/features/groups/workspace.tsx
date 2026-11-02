'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Expense, Group, Snapshot } from '../../shared/types';
import { calculateSettlement, splitEqually } from '../settlements/calculate';
import { db, describeError, listGroups, readGroup, rpc } from './api';

const money = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const field = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function Workspace({ userId }: { userId: string }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const n = ++request.current;
    try { const data = await listGroups(); if (n === request.current) { setGroups(data); setLoaded(true); setError(''); } }
    catch (e) { if (n === request.current) { setError(describeError(e)); setLoaded(true); } }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    const channel = db().channel(`my-groups:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, () => void refresh())
      .subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    window.addEventListener('online', focus);
    return () => { void db().removeChannel(channel); window.removeEventListener('focus', focus); window.removeEventListener('online', focus); };
  }, [refresh, userId]);
  async function submit(event: FormEvent<HTMLFormElement>, join: boolean) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError('');
    try {
      const id = join
        ? await rpc('join_travel_group', { p_code: field(data, 'code') })
        : await rpc('create_travel_group', { p_name: field(data, 'name') });
      form.reset(); setSelected(id); await refresh();
    } catch (e) { setError(describeError(e)); } finally { setBusy(false); }
  }
  return <main className="workspace">
    <aside className="sidebar">
      <p className="eyebrow">MY JOURNEYS</p><h1>나의 여행</h1><p className="muted">함께할 사람들을 모아보세요.</p>
      <nav aria-label="여행 그룹">{groups.map(g => <button key={g.id} className={`group-link ${selected === g.id ? 'active' : ''}`} onClick={() => setSelected(g.id)}><span>{g.name}</span><small>{g.destination || '여행지를 정해보세요'}</small></button>)}</nav>
      {loaded && !groups.length && <p className="muted">아직 참여한 여행이 없어요.</p>}
      <form onSubmit={e => void submit(e, false)}><h2>새 여행 만들기</h2><label>그룹 이름<input name="name" required maxLength={80} placeholder="예: 제주에서 보내는 주말"/></label><button disabled={busy}>그룹 만들기</button></form>
      <form onSubmit={e => void submit(e, true)}><h2>초대받았나요?</h2><label>초대 코드<input name="code" required minLength={32} maxLength={32} placeholder="32자리 초대 코드" autoComplete="off"/></label><button className="secondary" disabled={busy}>그룹 참여하기</button></form>
      <button className="text-button" onClick={() => void refresh()}>목록 새로고침</button>
      {error && <p className="error" role="alert">{error}</p>}
    </aside>
    {selected ? <GroupDetail key={`${userId}:${selected}`} id={selected} userId={userId}/> : <section className="welcome"><div className="journey-mark" aria-hidden="true">↗</div><p className="eyebrow">A LITTLE LESS MATH, A LOT MORE TRAVEL</p><h2>다음 여행,<br/>누구와 떠나나요?</h2><p>그룹을 만들거나 초대 코드로 참여하세요.<br/>함께 쓴 경비를 모으면 보낼 금액까지 계산해 드려요.</p><div className="steps"><span>01 그룹 만들기</span><span>02 결제 기록하기</span><span>03 가볍게 정산하기</span></div></section>}
  </main>;
}

function GroupDetail({ id, userId }: { id: string; userId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState('연결 중');
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [editParticipants, setEditParticipants] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');
  const [formKey, setFormKey] = useState(0);
  const [tripEdit, setTripEdit] = useState<Group | null>(null);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const n = ++request.current;
    try { const data = await readGroup(id); if (n === request.current) { setSnapshot(data); setLoadError(''); } }
    catch (e) { if (n === request.current) setLoadError(describeError(e)); }
  }, [id]);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    const channel = db().channel(`group:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${id}` }, () => void refresh())
      .subscribe(status => {
        setConnection(status === 'SUBSCRIBED' ? '실시간 연결됨' : '연결 확인 필요 · 새로고침 가능');
        if (status === 'SUBSCRIBED') void refresh();
      });
    const focus = () => void refresh();
    window.addEventListener('focus', focus); window.addEventListener('online', focus);
    return () => { void db().removeChannel(channel); window.removeEventListener('focus', focus); window.removeEventListener('online', focus); };
  }, [id, refresh]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); await refresh(); } catch (e) { setError(describeError(e)); } finally { setBusy(false); }
  }
  if (!snapshot) return <section className="detail"><p role="status">{loadError || '여행을 불러오고 있습니다…'}</p><button onClick={() => void refresh()}>다시 조회</button></section>;
  const { group, members, expenses, shares } = snapshot;
  const owner = group.created_by === userId;
  const name = (uid: string) => members.find(m => m.user_id === uid)?.display_name ?? uid.slice(0, 8);
  let settlement: ReturnType<typeof calculateSettlement> | null = null;
  let settlementError = '';
  try { settlement = calculateSettlement(members, expenses, shares); } catch (e) { settlementError = describeError(e); }
  async function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const participants = data.getAll('participants').map(String);
    const amount = Number(field(data, 'amount'));
    await run(async () => {
      splitEqually(amount, participants);
      await rpc('save_travel_expense', { p_group_id: id, p_title: field(data, 'title'), p_amount: amount,
        p_paid_by: field(data, 'paid_by'), p_spent_on: field(data, 'spent_on'), p_participants: participants,
        p_expense_id: editing?.id ?? null, p_version: editing?.version ?? null });
      setEditing(null); setFormKey(k => k + 1); setNotice('결제 내역을 저장했습니다.');
    });
  }
  return <section className="detail">
    <div className="detail-top"><div><p className="eyebrow">OUR JOURNEY</p><h1>{group.name}</h1><p>{group.destination || '여행지 미정'} <span className="muted">/ {group.start_date ? `${group.start_date} — ${group.end_date}` : '일정을 정해보세요'}</span></p></div><div className="sync"><span>{connection}</span><button className="text-button" onClick={() => void refresh()}>새로고침</button></div></div>
    <div className="member-list" aria-label="그룹 구성원">{members.map(m => <span className="member" key={m.user_id}>{m.display_name}{m.user_id === userId ? ' (나)' : ''}</span>)}</div>
    {owner && <div className="owner-tools"><button className="secondary" disabled={busy} onClick={() => setTripEdit({ ...group })}>여행 설정</button><button className="secondary" disabled={busy} onClick={() => void run(async () => setInvite(await rpc('get_group_invite', { p_group_id: id })))}>초대 코드 보기</button>{invite && <label>여행원에게 공유할 초대 코드<input readOnly value={invite} onFocus={e => e.target.select()}/></label>}</div>}
    {tripEdit && <form className="card" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void run(async () => { await rpc('update_travel_group', { p_group_id: id, p_version: tripEdit.version, p_destination: field(data, 'destination'), p_start: field(data, 'start') || null, p_end: field(data, 'end') || null }); setTripEdit(null); setNotice('여행 정보를 저장했습니다.'); }); }}>
      <h2>여행 설정</h2><fieldset disabled={busy}><label>여행지<input name="destination" maxLength={120} defaultValue={tripEdit.destination}/></label><div className="form-row"><label>시작일<input name="start" type="date" defaultValue={tripEdit.start_date ?? ''}/></label><label>종료일<input name="end" type="date" defaultValue={tripEdit.end_date ?? ''}/></label></div><p className="muted">날짜는 둘 다 입력하거나 둘 다 비워주세요.</p><button>저장</button> <button type="button" className="secondary" onClick={() => setTripEdit(null)}>취소</button></fieldset>
    </form>}
    {loadError && <p className="error" role="alert">{loadError}</p>}{error && <p className="error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    <div className="stats"><div><span>여행 총 경비</span><strong>{money(expenses.reduce((n,e) => n + e.amount,0))}</strong></div><div><span>함께하는 여행원</span><strong>{members.length}<small>명</small></strong></div><div><span>기록한 결제</span><strong>{expenses.length}<small>건</small></strong></div></div>
    <div className="content-grid">
      <section className="card"><div className="section-title"><h2>함께 쓴 경비</h2><span className="muted">KRW</span></div>{!expenses.length && <p className="empty">첫 번째 결제를 기록해보세요.</p>}
        {expenses.map(e => <article className="expense" key={e.id}><div><h3>{e.title}</h3><p className="muted">{e.spent_on} · 결제 {name(e.paid_by)}</p><p className="muted">분담: {shares.filter(s => s.expense_id === e.id).map(s => `${name(s.user_id)} ${money(s.amount)}`).join(', ')}</p></div><div className="expense-right"><strong>{money(e.amount)}</strong>{e.created_by === userId && <div><button className="text-button" disabled={busy} onClick={() => { setEditing({ ...e }); setEditParticipants(shares.filter(s => s.expense_id === e.id).map(s => s.user_id)); setFormKey(k => k + 1); setNotice('결제 입력란에서 수정한 뒤 저장하세요.'); }}>수정</button><button className="text-button danger" disabled={busy} onClick={() => { if (window.confirm(`“${e.title}” 결제를 삭제할까요?`)) void run(async () => { await rpc('delete_travel_expense', { p_expense_id: e.id, p_version: e.version }); if (editing?.id === e.id) { setEditing(null); setFormKey(k => k + 1); } setNotice('결제 내역을 삭제했습니다.'); }); }}>삭제</button></div>}</div></article>)}
      </section>
      <form className="card expense-form" key={formKey} onSubmit={e => void saveExpense(e)}><p className="eyebrow">ADD A MEMORY OF SPENDING</p><h2>{editing ? '결제 수정' : '결제 기록하기'}</h2><fieldset disabled={busy}><label>어디에 썼나요?<input name="title" required maxLength={120} defaultValue={editing?.title ?? ''} placeholder="예: 바다 앞에서 저녁 식사"/></label><label>결제 금액 (원)<input name="amount" type="number" min="1" max="1000000000" step="1" required defaultValue={editing?.amount} placeholder="0"/></label><div className="form-row"><label>결제한 여행원<select name="paid_by" defaultValue={editing?.paid_by ?? userId}>{members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label><label>결제일<input name="spent_on" type="date" required defaultValue={editing?.spent_on ?? today()}/></label></div><fieldset className="participants"><legend>함께 나눌 여행원</legend>{members.map(m => <label className="check" key={m.user_id}><input name="participants" type="checkbox" value={m.user_id} defaultChecked={!editing || editParticipants.includes(m.user_id)}/>{m.display_name}</label>)}</fieldset><p className="muted">선택한 사람끼리 균등 분담합니다. 남는 1원은 사용자 ID 오름차순으로 배분합니다.</p><button className="full">{busy ? '처리 중…' : editing ? '수정 저장' : '결제 추가'}</button>{editing && <button type="button" className="text-button" onClick={() => { setEditing(null); setFormKey(k => k + 1); }}>편집 취소 · 최신 데이터로 새로 입력</button>}</fieldset></form>
    </div>
    <section className="card settlement"><p className="eyebrow">TIME TO SETTLE UP</p><h2>최종 정산</h2><p className="muted">현재 저장된 결제 내역 기준입니다. 실제 송금은 직접 진행해주세요.</p>{settlementError && <p className="error" role="alert">{settlementError}</p>}
      {settlement && <><div className="table-scroll"><table><thead><tr><th>여행원</th><th>결제한 금액</th><th>부담할 금액</th><th>받을 / 보낼 금액</th></tr></thead><tbody>{settlement.rows.map(r => <tr key={r.user_id}><td>{r.name}</td><td>{money(r.paid)}</td><td>{money(r.owed)}</td><td className={r.balance > 0 ? 'positive' : ''}>{r.balance > 0 ? `받을 ${money(r.balance)}` : r.balance < 0 ? `보낼 ${money(-r.balance)}` : '정산 완료'}</td></tr>)}</tbody></table></div><div className="transfers">{settlement.transfers.map((t,i) => <p key={i}><span>{name(t.from)} <span className="arrow">→</span> {name(t.to)}</span><strong>{money(t.amount)}</strong></p>)}{!settlement.transfers.length && <p>서로 보낼 금액이 없습니다.</p>}</div></>}
    </section>
  </section>;
}
