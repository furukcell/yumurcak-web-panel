import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { CheckOutlined, CloseOutlined, CreditCardOutlined, CrownOutlined, EditOutlined, LockOutlined, ReloadOutlined, StopOutlined, UnlockOutlined } from '@ant-design/icons';
import { useAuth } from '../src/context/AuthContext';
import { getPlatformSnapshot } from './superadminService';
import { activateManualSubscription, approveManualRequest, confirmManualPayment, endSubscription, formatPrice, getTierById, getSuggestedTier, PACKAGE_TIERS, rejectManualRequest, setManualAccessRestriction, subscribeManualRequests, subscriptionStatus, updateSubscriptionDetails } from './superadminSubscriptionService';

const { Title, Text } = Typography;
const card = { borderRadius: 16, border: '1px solid #ECECF2', boxShadow: '0 8px 24px rgba(26,20,56,.05)' };

function nameOf(r) { return r?.ad || r?.adSoyad || r?.isim || r?.kresAdi || r?.kresId || 'İsimsiz kurum'; }
function planOf(s) { if (!s) return '—'; const tier = s.planTier === 'per_student' ? 'Öğrenci bazlı özel' : getTierById(s.planTier).title; const p = s.planPeriod === 'yillik' ? 'Yıllık' : s.planPeriod === 'aylik' ? 'Aylık' : s.planPeriod || ''; return `${tier}${p ? ` / ${p}` : ''}`; }
function dateOf(v) { return v ? new Date(v).toLocaleDateString('tr-TR') : '—'; }

export default function SuperAdminSubscriptions() {
  const { kullanici } = useAuth();
  const [data, setData] = useState(null);
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState('requests');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [busy, setBusy] = useState(false);

  const load = () => getPlatformSnapshot().then(setData).catch((e) => setError(e?.message || 'Abonelik verileri alınamadı.'));
  useEffect(() => { load(); const unsub = subscribeManualRequests(setRequests); return unsub; }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return data.institutions.filter((r) => !needle || [nameOf(r), r.il, r.ilce, r.telefon, r.email, r.id].some((x) => String(x || '').toLocaleLowerCase('tr-TR').includes(needle))).map((r) => ({ ...r, subscription: data.subscriptionsByKres[r.id] || null }));
  }, [data, q]);

  const googleRows = rows.filter((r) => r.subscription?.kaynak === 'revenuecat');
  const manualRows = rows.filter((r) => r.subscription?.kaynak === 'manuel_iban');
  const pending = requests.filter((r) => r.durum === 'bekliyor');

  const openManual = (row) => { form.resetFields(); form.setFieldsValue({ period:'aylik', tierId:getSuggestedTier(data.childrenByKres[row.id] || 0).id }); setModal({ type:'manual', row }); };
  const saveManual = async () => { try { const v = await form.validateFields(); setBusy(true); await activateManualSubscription({ kresId:modal.row.id, ...v, customEndDate:v.customEndDate?.format('YYYY-MM-DD'), tanimlayanUid:kullanici?.uid || kullanici?.id || '', existingSubscription:modal.row.subscription }); message.success('Manuel / IBAN abonelik aktif edildi.'); setModal(null); await load(); } catch(e) { if (e?.errorFields) return; message.error(e?.message || 'Abonelik tanımlanamadı.'); } finally { setBusy(false); } };
  const approve = async (r) => { Modal.confirm({ title:'Talebi onayla', content:`${r.kresAdi || r.kresId} — ${r.ogrenciSayisi} öğrenci × ${formatPrice(r.birimFiyat)} = ${formatPrice(r.hesaplananTutar)}`, okText:'Onayla', cancelText:'Vazgeç', onOk:async()=>{ setBusy(true); try { await approveManualRequest({ kresId:r.kresId, talepId:r.talepId, tanimlayanUid:kullanici?.uid || kullanici?.id || '', existingSubscription:data.subscriptionsByKres[r.kresId] || null }); message.success('Abonelik aktif edildi.'); await load(); } catch(e){ message.error(e?.message || 'Talep onaylanamadı.'); } finally{setBusy(false);} } }); };
  const reject = async (r) => { Modal.confirm({ title:'Talebi reddet', content:'Bu talep reddedilecek.', okText:'Reddet', okButtonProps:{danger:true}, cancelText:'Vazgeç', onOk:async()=>{ setBusy(true); try { await rejectManualRequest({ kresId:r.kresId, talepId:r.talepId, redNotu:'Web SuperAdmin tarafından reddedildi.', tanimlayanUid:kullanici?.uid || kullanici?.id || '' }); message.success('Talep reddedildi.'); } catch(e){message.error(e?.message || 'Talep reddedilemedi.');} finally{setBusy(false);} } }); };
  const pay = async (r) => { Modal.confirm({ title:'Ödeme geldi', content:`${nameOf(r)} için bir sonraki dönem uzatılsın mı?`, okText:'Ödemeyi onayla', cancelText:'Vazgeç', onOk:async()=>{ setBusy(true); try{await confirmManualPayment({kresId:r.id,subscription:r.subscription,tanimlayanUid:kullanici?.uid || kullanici?.id || ''}); message.success('Ödeme işlendi, abonelik uzatıldı.'); await load();}catch(e){message.error(e?.message || 'Ödeme işlenemedi.');}finally{setBusy(false);}}}); };
  const restrict = async (r, value) => { setBusy(true); try{await setManualAccessRestriction({kresId:r.id,restricted:value,tanimlayanUid:kullanici?.uid || kullanici?.id || ''}); message.success(value?'Erişim kısıtlandı.':'Erişim kısıtlaması kaldırıldı.'); await load();}catch(e){message.error(e?.message || 'İşlem başarısız.');}finally{setBusy(false);} };

  const endSub = (r) => { Modal.confirm({ title:`${nameOf(r)} aboneliği sonlandırılsın mı?`, content:'Kurum yöneticisinin panele girişi engellenecek. Kayıtlar silinmez, istersen daha sonra yeniden aktif edebilirsin.', okText:'Evet, sonlandır', okButtonProps:{danger:true}, cancelText:'Vazgeç', onOk:async()=>{ setBusy(true); try{ await endSubscription({kresId:r.id,tanimlayanUid:kullanici?.uid || kullanici?.id || ''}); message.success('Abonelik sonlandırıldı, erişim kapatıldı.'); await load(); }catch(e){message.error(e?.message || 'Abonelik sonlandırılamadı.');}finally{setBusy(false);} } }); };

  const openEdit = (row) => {
    editForm.resetFields();
    editForm.setFieldsValue({
      fiyat: row.subscription?.fiyat ?? null,
      bitisTarihi: row.subscription?.bitisTarihi || '',
    });
    setModal({ type:'edit', row });
  };
  const saveEdit = async () => {
    try {
      const v = await editForm.validateFields();
      setBusy(true);
      await updateSubscriptionDetails({ kresId:modal.row.id, fiyat:v.fiyat, bitisTarihi:v.bitisTarihi, tanimlayanUid:kullanici?.uid || kullanici?.id || '' });
      message.success('Abonelik güncellendi.');
      setModal(null);
      await load();
    } catch (e) {
      if (e?.errorFields) return;
      message.error(e?.message || 'Abonelik güncellenemedi.');
    } finally {
      setBusy(false);
    }
  };

  const subscriptionColumns = [
    { title:'Kurum', dataIndex:'ad', key:'name', render:(_,r)=><div><Text strong>{nameOf(r)}</Text><br/><Text type="secondary" style={{fontSize:11}}>{r.id}</Text></div> },
    { title:'Plan', key:'plan', render:(_,r)=>planOf(r.subscription) },
    { title:'Kaynak', key:'source', render:(_,r)=>r.subscription?.kaynak === 'revenuecat' ? <Tag color="blue">Google Play / RevenueCat</Tag> : <Tag color="gold">Manuel / IBAN</Tag> },
    { title:'Durum', key:'status', render:(_,r)=>{const s=subscriptionStatus(r.subscription); return <Tag color={s.color}>{s.label}</Tag>;} },
    { title:'Bitiş', key:'end', render:(_,r)=>dateOf(r.subscription?.bitisTarihi) },
    { title:'Tutar', key:'price', align:'right', render:(_,r)=>formatPrice(r.subscription?.fiyat) },
  ];

  const commonActions = (r) => [
    <Button key="edit" size="small" icon={<EditOutlined />} onClick={()=>openEdit(r)}>Düzenle</Button>,
    <Button key="end" danger size="small" icon={<StopOutlined />} disabled={r.subscription?.erisimKisitli === true} onClick={()=>endSub(r)}>{r.subscription?.erisimKisitli === true ? 'Sonlandırıldı' : 'Sonlandır'}</Button>,
  ];

  const googleColumns = [...subscriptionColumns, { title:'İşlemler', key:'actions', align:'right', render:(_,r)=><Space wrap>{commonActions(r)}</Space> }];

  const manualColumns = [...subscriptionColumns, { title:'İşlemler', key:'actions', align:'right', render:(_,r)=><Space wrap><Button size="small" icon={<CreditCardOutlined />} onClick={()=>pay(r)}>Ödeme Geldi</Button><Button size="small" icon={r.subscription?.erisimKisitli?<UnlockOutlined/>:<LockOutlined/>} onClick={()=>restrict(r,!r.subscription?.erisimKisitli)}>{r.subscription?.erisimKisitli?'Kısıtı Kaldır':'Erişimi Kısıtla'}</Button>{commonActions(r)}</Space> }];

  const requestColumns = [
    { title:'Kurum', key:'name', render:(_,r)=><Text strong>{r.kresAdi || r.kresId}</Text> },
    { title:'Öğrenci', dataIndex:'ogrenciSayisi', align:'center' },
    { title:'Dönem', dataIndex:'period', render:(v)=>v==='yillik'?'Yıllık':'Aylık' },
    { title:'Birim fiyat', dataIndex:'birimFiyat', render:formatPrice },
    { title:'Toplam', dataIndex:'hesaplananTutar', render:formatPrice },
    { title:'Durum', dataIndex:'durum', render:(v)=>v==='bekliyor'?<Tag color="orange">Bekliyor</Tag>:v==='onaylandi'?<Tag color="green">Onaylandı</Tag>:<Tag color="red">Reddedildi</Tag> },
    { title:'İşlem', key:'actions', align:'right', render:(_,r)=>r.durum==='bekliyor'?<Space><Button type="primary" size="small" icon={<CheckOutlined/>} onClick={()=>approve(r)} loading={busy}>Onayla</Button><Button danger size="small" icon={<CloseOutlined/>} onClick={()=>reject(r)} disabled={busy}>Reddet</Button></Space>:null },
  ];

  if (error) return <Alert type="error" showIcon message="Abonelik yönetimi yüklenemedi" description={error} />;
  if (!data) return <Card loading style={card} />;

  return <div style={{maxWidth:1500,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-end',marginBottom:20}}>
      <div><Title level={2} style={{margin:0}}>Abonelik Yönetimi</Title><Text type="secondary">Google Play / RevenueCat, Manuel / IBAN ve öğrenci bazlı talepler.</Text></div>
      <Space><Input allowClear placeholder="Kurum ara..." value={q} onChange={e=>setQ(e.target.value)} style={{width:260}}/><Button icon={<ReloadOutlined/>} onClick={load}>Yenile</Button></Space>
    </div>
    <Row gutter={[16,16]}>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Toplam abonelik" value={data.subscriptions.length} prefix={<CrownOutlined/>}/></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Google Play" value={googleRows.length}/></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Manuel / IBAN" value={manualRows.length}/></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card style={card}><Statistic title="Bekleyen talepler" value={pending.length}/></Card></Col>
    </Row>
    <Card style={{...card,marginTop:16}} bodyStyle={{paddingBottom:8}}>
      <Space wrap style={{marginBottom:8}}>
        <Button type={tab==='requests'?'primary':'default'} onClick={()=>setTab('requests')}>Bekleyen Talepler ({pending.length})</Button>
        <Button type={tab==='google'?'primary':'default'} onClick={()=>setTab('google')}>Google Play ({googleRows.length})</Button>
        <Button type={tab==='manual'?'primary':'default'} onClick={()=>setTab('manual')}>Manuel / IBAN ({manualRows.length})</Button>
        {tab==='manual' && <Button type="dashed" onClick={()=>data.institutions.length && openManual(data.institutions[0])}>Kurumdan Manuel Abonelik Tanımla</Button>}
      </Space>
    </Card>
    {tab==='requests' && <Card style={{...card,marginTop:16}} title="Öğrenci Bazlı Abonelik Talepleri"><Table rowKey="talepId" columns={requestColumns} dataSource={requests} pagination={{pageSize:15}} locale={{emptyText:'Henüz abonelik talebi yok.'}}/></Card>}
    {tab==='google' && <Card style={{...card,marginTop:16}} title="Google Play / RevenueCat"><Table rowKey="id" columns={googleColumns} dataSource={googleRows} pagination={{pageSize:20}} locale={{emptyText:'Google Play aboneliği bulunamadı.'}}/></Card>}
    {tab==='manual' && <Card style={{...card,marginTop:16}} title="Manuel / IBAN"><Table rowKey="id" columns={manualColumns} dataSource={manualRows} pagination={{pageSize:20}} locale={{emptyText:'Henüz manuel abonelik yok. Yukarıdaki butondan kurum seçerek tanımlayabilirsin.'}}/></Card>}

    <Modal open={modal?.type==='manual'} title={`${modal?.row ? nameOf(modal.row) : ''} — Manuel / IBAN Abonelik`} okText="Aktif Et" cancelText="Vazgeç" confirmLoading={busy} onOk={saveManual} onCancel={()=>!busy&&setModal(null)} destroyOnHidden width={560}>
      <Form form={form} layout="vertical" style={{marginTop:18}}>
        <Form.Item name="tierId" label="Paket" rules={[{required:true,message:'Paket seç'}]}><Select options={PACKAGE_TIERS.map(t=>({value:t.id,label:`${t.title} — ${t.range} (${formatPrice(t.monthly)}/ay)`}))}/></Form.Item>
        <Form.Item name="period" label="Dönem" rules={[{required:true}]}><Select options={[{value:'aylik',label:'Aylık'},{value:'yillik',label:'Yıllık'},{value:'ozel',label:'Özel bitiş tarihi'}]}/></Form.Item>
        <Form.Item noStyle shouldUpdate={(p,c)=>p.period!==c.period}>{({getFieldValue})=>getFieldValue('period')==='ozel'?<Form.Item name="customEndDate" label="Bitiş tarihi" rules={[{required:true,message:'Bitiş tarihi seç'}]}><DatePicker style={{width:'100%'}} format="DD.MM.YYYY"/></Form.Item>:null}</Form.Item>
        <Form.Item name="price" label="Tutar (TL)" extra="Boş bırakırsan paketin standart fiyatı kullanılır."><InputNumber min={0} style={{width:'100%'}}/></Form.Item>
        <Form.Item name="odemeReferansi" label="Ödeme / Dekont referansı"><Input placeholder="Opsiyonel"/></Form.Item>
        <Form.Item name="manuelNot" label="Not"><Input.TextArea rows={3} placeholder="Opsiyonel SuperAdmin notu"/></Form.Item>
      </Form>
    </Modal>

    <Modal open={modal?.type==='edit'} title={`${modal?.row ? nameOf(modal.row) : ''} — Abonelik Düzenle`} okText="Kaydet" cancelText="Vazgeç" confirmLoading={busy} onOk={saveEdit} onCancel={()=>!busy&&setModal(null)} destroyOnHidden width={480}>
      <Form form={editForm} layout="vertical" style={{marginTop:18}}>
        <Form.Item name="fiyat" label="Tutar (TL)"><InputNumber min={0} style={{width:'100%'}}/></Form.Item>
        <Form.Item name="bitisTarihi" label="Bitiş Tarihi" extra="YYYY-AA-GG formatında, örn. 2026-12-31"><Input type="date" /></Form.Item>
      </Form>
    </Modal>
  </div>;
}
