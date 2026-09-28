import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Input, List, Modal, Space, Tag, Typography, message } from 'antd';
import { MessageOutlined, SendOutlined, CloseCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { onValue, push, ref, update } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;
const MAX_LEN = 5000;
const TOPIC_KEYS = ['istek','sorun','abonelik','hesap','diger'];
const toList = (v) => Object.entries(v || {}).map(([id, x]) => ({ id, ...(x || {}) }));
const date = (v, locale) => { const d = new Date(Number(v)); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString(locale,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); };
const isSuper = (r) => String(r || '').toLowerCase().includes('super');

export default function SupportPage() {
  const { kullanici, kres } = useAuth();
  const { t, i18n } = useTranslation();
  const [tickets,setTickets]=useState([]), [selected,setSelected]=useState(null), [reply,setReply]=useState(''), [sending,setSending]=useState(false);
  const [newOpen,setNewOpen]=useState(false), [topic,setTopic]=useState('istek'), [subject,setSubject]=useState(''), [text,setText]=useState(''), [creating,setCreating]=useState(false);
  const userId=kullanici?.id||kullanici?.uid||kullanici?.authUid||'', kresId=kullanici?.kresId||kres?.id||'';

  useEffect(()=>{
    if(!kresId) return ()=>{};
    const unsub=onValue(ref(database,'destekMesajlari'),snap=>{
      const rows=toList(snap.val()).filter(x=>x.kresId===kresId && (x.userId===userId || x.senderRole==='superadmin')).sort((a,b)=>Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0));
      setTickets(rows); setSelected(p=>p?rows.find(x=>x.id===p.id)||p:null);
    },()=>setTickets([]));
    return ()=>unsub();
  },[kresId,userId]);

  const unread=useMemo(()=>tickets.filter(t=>t.durum==='yeni' && toList(t.yanitlar).some(r=>isSuper(r.authorRole))).length,[tickets]);
  const replies=useMemo(()=>selected?toList(selected.yanitlar).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0)):[],[selected]);
  const openTicket=async t=>{setSelected(t); if(userId) try{await update(ref(database,`destekMesajlari/${t.id}`),{[`okunduBy/${userId}`]:Date.now()});}catch(e){} };

  const sendReply=async()=>{
    const clean=reply.trim(); if(!selected||!clean)return; if(clean.length>MAX_LEN)return message.warning(t('support.maxReply', { max: MAX_LEN }));
    setSending(true); try{const now=Date.now(), r=push(ref(database,`destekMesajlari/${selected.id}/yanitlar`)); await update(ref(database),{
      [`destekMesajlari/${selected.id}/yanitlar/${r.key}`]:{id:r.key,mesaj:clean,authorId:userId,authorName:`${kullanici?.ad||''} ${kullanici?.soyad||''}`.trim()||kullanici?.kullaniciAdi||'Kurum Yöneticisi',authorRole:'yonetici',createdAt:now},
      [`destekMesajlari/${selected.id}/durum`]:'yanitlandi', [`destekMesajlari/${selected.id}/updatedAt`]:now, [`destekMesajlari/${selected.id}/okunduBy/${userId}`]:now}); setReply(''); message.success(t('support.replySent'));
    }catch(e){console.error(e);message.error(t('support.replyError'));}finally{setSending(false);}
  };
  const createTicket=async()=>{const clean=text.trim();if(!clean)return message.warning(t('support.writeMessage'));setCreating(true);try{const now=Date.now(),label=t(`support.topic.${topic}`),r=push(ref(database,'destekMesajlari'));await update(r,{id:r.key,konu:topic,konuBaslik:subject.trim()||label,mesaj:clean,durum:'yeni',kresId,kresAdi:kres?.ad||kres?.isim||kres?.kresAdi||'',userId,userRole:'yonetici',userName:`${kullanici?.ad||''} ${kullanici?.soyad||''}`.trim()||kullanici?.kullaniciAdi||'Kurum Yöneticisi',userPhone:kullanici?.telefon||'',userUsername:kullanici?.kullaniciAdi||'',createdAt:now,updatedAt:now});setText('');setSubject('');setTopic('istek');setNewOpen(false);message.success(t('support.ticketCreated'));}catch(e){console.error(e);message.error(t('support.ticketCreateError'));}finally{setCreating(false);}};
  const closeTicket=async()=>{if(!selected)return;try{await update(ref(database,`destekMesajlari/${selected.id}`),{durum:'kapandi',updatedAt:Date.now()});message.success(t('support.ticketClosed'));}catch(e){message.error(t('support.ticketCloseError'));}};

  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,gap:16}}><div><Title level={3} style={{margin:0}}>💬 {t('support.title')}</Title><Text type="secondary">{t('support.subtitle')}</Text></div><Button type="primary" icon={<PlusOutlined/>} onClick={()=>setNewOpen(true)}>{t('support.newTicket')}</Button></div>
    {unread>0&&<Alert showIcon type="info" message={t('support.unread', { count: unread })} style={{marginBottom:16}}/>}
    <Card><List dataSource={tickets} locale={{emptyText:<Empty description={t('support.empty')}/>}} renderItem={item=><List.Item onClick={()=>openTicket(item)} style={{cursor:'pointer',padding:'16px 12px'}}><List.Item.Meta title={<Space>{item.konuBaslik||item.konu||t('support.title')} {item.durum==='kapandi'?<Tag>{t('support.closed')}</Tag>:item.durum==='yanitlandi'?<Tag color="green">{t('support.answered')}</Tag>:<Tag color="orange">{t('support.new')}</Tag>}</Space>} description={<><Text type="secondary">{item.mesaj}</Text><br/><Text type="secondary" style={{fontSize:11}}>{date(item.updatedAt||item.createdAt, i18n.language)}</Text></>}/><MessageOutlined/></List.Item>}/></Card>
    <Modal open={!!selected} onCancel={()=>setSelected(null)} title={selected?.konuBaslik||t('support.title')} width={760} footer={null}>{selected&&<Space direction="vertical" size={14} style={{width:'100%'}}><Card size="small"><Text>{selected.mesaj}</Text><div><Text type="secondary" style={{fontSize:11}}>{date(selected.createdAt, i18n.language)}</Text></div></Card>{replies.map(r=><Card key={r.id} size="small" style={{background:isSuper(r.authorRole)?'#F6F2FF':'#FAFAFA'}}><Text strong>{isSuper(r.authorRole)?t('support.team'):(r.authorName||t('support.you'))}</Text><div style={{marginTop:6}}>{r.mesaj}</div><Text type="secondary" style={{fontSize:11}}>{date(r.createdAt, i18n.language)}</Text></Card>)}{selected.durum!=='kapandi'&&<><Input.TextArea rows={4} maxLength={MAX_LEN} showCount value={reply} onChange={e=>setReply(e.target.value)} placeholder={t('support.replyPlaceholder')}/><Space><Button type="primary" icon={<SendOutlined/>} loading={sending} onClick={sendReply}>{t('common.send')}</Button><Button icon={<CloseCircleOutlined/>} onClick={closeTicket}>{t('support.closeTicket')}</Button></Space></>}</Space>}</Modal>
    <Modal open={newOpen} onCancel={()=>!creating&&setNewOpen(false)} title={t('support.newTicket')} okText={t('common.send')} cancelText={t('common.cancel')} onOk={createTicket} confirmLoading={creating} width={620}><Space direction="vertical" style={{width:'100%'}} size={12}><div><Text strong>{t('support.topicLabel')}</Text><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>{TOPIC_KEYS.map((k)=><Button key={k} type={topic===k?'primary':'default'} onClick={()=>setTopic(k)}>{t(`support.topic.${k}`)}</Button>)}</div></div><Input value={subject} onChange={e=>setSubject(e.target.value)} placeholder={t('support.subjectPlaceholder')} maxLength={120}/><Input.TextArea value={text} onChange={e=>setText(e.target.value)} placeholder={t('support.messagePlaceholder')} rows={7} maxLength={MAX_LEN} showCount/></Space></Modal>
  </div>;
}
