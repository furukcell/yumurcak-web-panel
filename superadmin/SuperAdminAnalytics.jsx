import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Col, Row, Select, Table, Tag, Typography, Statistic, Progress, Empty } from 'antd';
import { ThunderboltOutlined, ApartmentOutlined, TeamOutlined, LoginOutlined, RiseOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { getPlatformSnapshot, getUsageLogs, normalizeUsageLogs, usageSummary, getTrialInfo } from './superadminService';

const { Title, Text } = Typography;
const card = { borderRadius: 16, border: '1px solid #ECECF2', boxShadow: '0 8px 24px rgba(26,20,56,.05)' };
const DAY = 24 * 60 * 60 * 1000;
function dateText(ts) { return ts ? new Date(Number(ts)).toLocaleString('tr-TR') : '—'; }
function getInstitutionName(institution, id) { return institution?.ad || institution?.adSoyad || institution?.isim || institution?.kresAdi || id; }
function health(score) { if (score >= 75) return { label: 'Çok aktif', color: 'green' }; if (score >= 50) return { label: 'Aktif', color: 'blue' }; if (score >= 20) return { label: 'Düşük kullanım', color: 'orange' }; return { label: 'Pasif', color: 'red' }; }

export default function SuperAdminAnalytics() {
  const [snapshot, setSnapshot] = useState(null); const [logs, setLogs] = useState([]); const [kresId, setKresId] = useState('all'); const [error, setError] = useState('');
  useEffect(() => { Promise.all([getPlatformSnapshot(), getUsageLogs()]).then(([s, raw]) => { setSnapshot(s); setLogs(normalizeUsageLogs(raw)); }).catch((e) => setError(e?.message || 'Analitik verileri alınamadı.')); }, []);
  const filtered = useMemo(() => kresId === 'all' ? logs : logs.filter((x) => x.kresId === kresId), [logs, kresId]);
  const summary = useMemo(() => usageSummary(filtered), [filtered]);

  const trend = useMemo(() => { const rows = []; const now = Date.now(); for (let i = 29; i >= 0; i -= 1) { const start = new Date(now - i * DAY); start.setHours(0,0,0,0); const from = start.getTime(); const dayLogs = filtered.filter((x) => Number(x.timestamp) >= from && Number(x.timestamp) < from + DAY); rows.push({ key: start.toISOString().slice(0,10), label: start.toLocaleDateString('tr-TR',{day:'2-digit',month:'short'}), events: dayLogs.length, users: new Set(dayLogs.map((x)=>x.kullaniciId).filter(Boolean)).size, institutions: new Set(dayLogs.map((x)=>x.kresId).filter(Boolean)).size }); } return rows; }, [filtered]);
  const trendMax = Math.max(1, ...trend.map((x) => x.events));

  const users = useMemo(() => { const map = {}; filtered.forEach((x) => { const id=x.kullaniciId||x.userId; if(!id)return; if(!map[id])map[id]={id,events:0,last:0,today:0,last7:0,modules:new Set(),name:x.kullaniciAdi||x.userName||id,role:x.rol||x.role||'—'}; map[id].events+=1; map[id].last=Math.max(map[id].last,Number(x.timestamp||0)); if(Number(x.timestamp||0)>=summary.todayStart)map[id].today+=1; if(Number(x.timestamp||0)>=summary.last7Start)map[id].last7+=1; if(x.modul||x.module)map[id].modules.add(x.modul||x.module); }); return Object.values(map).map((x)=>({...x,modules:[...x.modules].join(', ')||'—'})).sort((a,b)=>b.events-a.events); }, [filtered,summary]);

  const moduleRows = useMemo(() => { const map={}; filtered.forEach((x)=>{const key=x.modul||x.module||'Diğer';map[key]=(map[key]||0)+1;}); return Object.entries(map).map(([modul,events])=>({modul,events})).sort((a,b)=>b.events-a.events); }, [filtered]);

  const institutionRows = useMemo(() => { const map={}, userSets={}, lastByInstitution={}, moduleSets={}; filtered.forEach((x)=>{const id=x.kresId;if(!id)return;map[id]=(map[id]||0)+1;if(!userSets[id])userSets[id]=new Set();if(x.kullaniciId)userSets[id].add(x.kullaniciId);if(!moduleSets[id])moduleSets[id]=new Set();if(x.modul||x.module)moduleSets[id].add(x.modul||x.module);lastByInstitution[id]=Math.max(lastByInstitution[id]||0,Number(x.timestamp||0));}); return (snapshot?.institutions||[]).map((institution)=>{const id=institution.id,events=map[id]||0,activeUsers=userSets[id]?.size||0,totalUsers=snapshot?.usersByKres?.[id]||0,usage=totalUsers?Math.min(100,Math.round(activeUsers/totalUsers*100)):(events?100:0),score=Math.min(100,Math.round(usage*.55+Math.min(events,100)*.25+(lastByInstitution[id]&&Date.now()-lastByInstitution[id]<7*DAY?20:0)));return{id,name:getInstitutionName(institution,id),events,activeUsers,totalUsers,usage,score,last:lastByInstitution[id]||0,modules:moduleSets[id]?.size||0};}).filter((row)=>kresId==='all'||row.id===kresId).sort((a,b)=>b.score-a.score||b.events-a.events); }, [filtered,snapshot,kresId]);
  const overallHealth=useMemo(()=>institutionRows.length?Math.round(institutionRows.reduce((sum,x)=>sum+x.score,0)/institutionRows.length):0,[institutionRows]);

  const trialRows = useMemo(() => (snapshot?.institutions || []).map((institution) => { const id=institution.id; const sub=snapshot?.subscriptionsByKres?.[id]; const info=getTrialInfo(sub,logs.filter((x)=>x.kresId===id)); return info?{id,name:getInstitutionName(institution,id),...info}:null; }).filter(Boolean).filter((x)=>kresId==='all'||x.id===kresId).sort((a,b)=>Number(a.ended)-Number(b.ended)||a.remainingDays-b.remainingDays), [snapshot,logs,kresId]);
  const kresOptions=snapshot?.institutions.map((r)=>({value:r.id,label:getInstitutionName(r,r.id)}))||[];
  if(error)return <Alert type="error" showIcon message="Analitik yüklenemedi" description={error}/>;
  if(!snapshot)return <Card loading style={card}/>;

  return <div style={{maxWidth:1500,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-end',marginBottom:20}}><div><Title level={2} style={{margin:0}}>Kullanım Analitiği</Title><Text type="secondary">Kim, ne zaman giriş yaptı ve hangi modülleri kullandı?</Text></div><Select value={kresId} onChange={setKresId} style={{minWidth:260}} options={[{value:'all',label:'Tüm kurumlar'},...kresOptions]} showSearch optionFilterProp="label"/></div>
    <Row gutter={[16,16]}>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Bugünkü aktiviteler" value={summary.todayEvents} prefix={<ThunderboltOutlined/>}/></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Bugün aktif kullanıcı" value={summary.activeUsersToday} prefix={<TeamOutlined/>}/></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="7 günde aktif kullanıcı" value={summary.activeUsers7d} prefix={<LoginOutlined/>}/></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Bugün aktif kurum" value={summary.activeInstitutionsToday} prefix={<ApartmentOutlined/>}/></Card></Col>
    </Row>

    <Row gutter={[16,16]} style={{marginTop:16}}>
      <Col xs={24} lg={17}><Card style={card} title={<span><RiseOutlined/> 30 Günlük Kullanım Trendi</span>} extra={<Text type="secondary">Olay / gün</Text>}>{trend.some((x)=>x.events)?<div style={{height:230,display:'flex',alignItems:'flex-end',gap:4,padding:'18px 4px 8px',overflowX:'auto'}}>{trend.map((x)=><div key={x.key} title={`${x.label}: ${x.events} aktivite, ${x.users} kullanıcı, ${x.institutions} kurum`} style={{minWidth:25,flex:1,maxWidth:42,height:'100%',display:'flex',flexDirection:'column',justifyContent:'flex-end',alignItems:'center'}}><Text style={{fontSize:10,marginBottom:4}}>{x.events||''}</Text><div style={{width:'70%',minHeight:x.events?4:2,height:`${Math.max(1,x.events/trendMax*100)}%`,background:'linear-gradient(180deg,#1677ff,#69b1ff)',borderRadius:'6px 6px 2px 2px'}}/><Text type="secondary" style={{fontSize:9,marginTop:5,whiteSpace:'nowrap'}}>{x.label}</Text></div>)}</div>:<Empty description="Henüz trend verisi oluşmadı"/>}</Card></Col>
      <Col xs={24} lg={7}><Card style={card} title="Platform Kullanım Sağlığı"><div style={{textAlign:'center',padding:'12px 0 8px'}}><Progress type="circle" percent={overallHealth} size={150}/><div style={{marginTop:12}}><Tag color={health(overallHealth).color}>{health(overallHealth).label}</Tag></div><Text type="secondary" style={{display:'block',marginTop:8}}>Kurumların ortalama kullanım skoru</Text></div></Card></Col>
    </Row>

    <Card style={{...card,marginTop:16}} title={<span><ClockCircleOutlined/> 15 Günlük Deneme Takibi</span>} extra={<Text type="secondary">Gerçek kullanım üzerinden satış takibi</Text>}>
      <Table rowKey="id" size="small" pagination={{pageSize:10}} dataSource={trialRows} locale={{emptyText:'Aktif veya kayıtlı demo dönemi bulunamadı'}} columns={[
        {title:'Kurum',dataIndex:'name',ellipsis:true},
        {title:'Dönem',render:(_,r)=>`${r.start.toLocaleDateString('tr-TR')} → ${r.end.toLocaleDateString('tr-TR')}`},
        {title:'Gün',render:(_,r)=>r.ended?<Tag color="red">Tamamlandı</Tag>:<Tag color="blue">${r.elapsedDay}/15</Tag>},
        {title:'Kalan',render:(_,r)=>r.ended?<Tag color="red">Süre doldu</Tag>:<Tag color={r.remainingDays<=3?'orange':'green'}>{r.remainingDays} gün</Tag>},
        {title:'Aktif kullanıcı',dataIndex:'activeUsers'},
        {title:'Aktivite',dataIndex:'totalEvents'},
        {title:'Modül',dataIndex:'modules'},
        {title:'Satış sinyali',render:(_,r)=>r.activeUsers>=3&&r.totalEvents>=20?<Tag color="green">Satışa hazır</Tag>:r.totalEvents>0?<Tag color="orange">Takip gerekli</Tag>:<Tag color="red">Kullanım yok</Tag>},
      ]}/>
    </Card>

    <Row gutter={[16,16]} style={{marginTop:16}}>
      <Col xs={24} lg={15}><Card style={card} title="Kurum Kullanım Sağlığı"><Table rowKey="id" size="small" pagination={{pageSize:12}} columns={[{title:'Kurum',dataIndex:'name',ellipsis:true},{title:'Durum',dataIndex:'score',render:(v)=>{const h=health(v);return <Tag color={h.color}>{h.label}</Tag>;}},{title:'Aktif kullanıcı',render:(_,r)=>`${r.activeUsers} / ${r.totalUsers}`},{title:'Aktivite',dataIndex:'events'},{title:'Sağlık',dataIndex:'score',render:(v)=><Progress percent={v} size="small"/>},{title:'Son aktivite',dataIndex:'last',render:dateText}]} dataSource={institutionRows} locale={{emptyText:'Henüz kullanım verisi yok'}}/></Card></Col>
      <Col xs={24} lg={9}><Card style={card} title="Modül Kullanımı"><Table rowKey="modul" size="small" pagination={false} columns={[{title:'Modül',dataIndex:'modul'},{title:'Olay',dataIndex:'events',align:'right'}]} dataSource={moduleRows} locale={{emptyText:'Kayıt yok'}}/></Card></Col>
    </Row>
    {!logs.length&&<Alert style={{marginTop:16}} type="warning" showIcon message="Henüz kullanım olayı kaydedilmemiş." description="Takip altyapısı artık aktif. Kullanıcılar uygulamayı açıp ekranlar arasında gezdikçe veriler burada oluşacak."/>}
    <Card style={{...card,marginTop:16}} title="Kullanıcı Aktivitesi"><Table rowKey="id" size="small" pagination={{pageSize:15}} columns={[{title:'Kullanıcı',dataIndex:'name',render:(v,r)=><div><Text strong>{v}</Text><br/><Text type="secondary" style={{fontSize:11}}>{r.role}</Text></div>},{title:'Bugün',dataIndex:'today'},{title:'Son 7 gün',dataIndex:'last7'},{title:'Toplam aktivite',dataIndex:'events',sorter:(a,b)=>a.events-b.events},{title:'Kullanılan modüller',dataIndex:'modules',render:(v)=><Tag>{v}</Tag>},{title:'Son aktivite',dataIndex:'last',render:dateText}]} dataSource={users}/></Card>
    <Card style={{...card,marginTop:16}} title="Son Kullanım Olayları"><Table rowKey="id" size="small" pagination={{pageSize:20}} dataSource={filtered.slice(0,300)} columns={[{title:'Zaman',dataIndex:'timestamp',render:dateText},{title:'Kullanıcı',dataIndex:'kullaniciAdi',render:(v,r)=>v||r.userName||r.kullaniciId||r.userId||'—'},{title:'Kurum',dataIndex:'kresId',render:(v)=>getInstitutionName(snapshot.institutions.find((i)=>i.id===v),v)},{title:'Modül',dataIndex:'modul',render:(v,r)=>v||r.module||'—'},{title:'İşlem',dataIndex:'islem',render:(v,r)=>v||r.action||'—'},{title:'Ekran',dataIndex:'screen',render:(v)=>v||'—'}]}/></Card>
  </div>;
}
