import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Form, Input, Modal, Space, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EyeOutlined, PlusOutlined, PoweroffOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getPlatformSnapshot } from './superadminService';
import { createInstitution, deleteInstitution, setInstitutionActive } from './superadminInstitutionService';

const { Title, Text } = Typography;
const card = { borderRadius: 16, border: '1px solid #ECECF2', boxShadow: '0 8px 24px rgba(26,20,56,.05)' };

const emptyForm = {
  ad: '', il: '', ilce: '', adres: '', telefon: '', email: '',
  yoneticiAd: '', yoneticiSoyad: '', yoneticiTelefon: '',
  kullaniciAdi: '', sifre: '', demoGun: '15',
};

export default function SuperAdminKresler() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [togglingId, setTogglingId] = useState('');
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  const load = () => {
    setError('');
    return getPlatformSnapshot().then(setData).catch((e) => setError(e?.message || 'Veriler alınamadı.'));
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return data.institutions.filter((r) => {
      if (!needle) return true;
      return [r.ad, r.adSoyad, r.isim, r.kresAdi, r.il, r.ilce, r.telefon, r.email].some((x) => String(x || '').toLocaleLowerCase('tr-TR').includes(needle));
    });
  }, [data, q]);

  const openCreate = () => {
    form.setFieldsValue(emptyForm);
    setCreateOpen(true);
  };

  const handleCreate = async (values) => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await createInstitution(values);
      messageApi.success(`${result.kresRecord.ad} oluşturuldu. Yönetici hesabı hazır.`);
      setCreateOpen(false);
      form.resetFields();
      await load();
    } catch (e) {
      const text = e?.code === 'auth/email-already-in-use'
        ? 'Bu kullanıcı adı zaten kullanılıyor. Farklı bir kullanıcı adı seç.'
        : (e?.message || 'Kreş oluşturulamadı.');
      messageApi.error(text);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: `${record.ad || record.kresAdi || 'Bu kreş'} silinsin mi?`,
      content: 'Kurum kaydı, yöneticileri, öğrencileri, sınıfları ve abonelik kaydı Firebase veritabanından kaldırılacak. Bu işlem geri alınamaz. Firebase Auth tarafındaki yönetici hesabı ayrıca kalabilir.',
      okText: 'Evet, sil',
      cancelText: 'Vazgeç',
      okButtonProps: { danger: true },
      centered: true,
      onOk: async () => {
        if (deletingId) return;
        setDeletingId(record.id);
        try {
          const result = await deleteInstitution(record.id, data);
          messageApi.success(`${record.ad || record.kresAdi || 'Kurum'} silindi. ${result.users} kullanıcı, ${result.children} çocuk, ${result.classes} sınıf kaldırıldı.`);
          await load();
        } catch (e) {
          messageApi.error(e?.message || 'Kreş silinemedi.');
        } finally {
          setDeletingId('');
        }
      },
    });
  };

  const handleToggleActive = (record) => {
    const nextActive = record.aktif === false;
    Modal.confirm({
      title: nextActive
        ? `${record.ad || record.kresAdi || 'Bu kreş'} tekrar aktif edilsin mi?`
        : `${record.ad || record.kresAdi || 'Bu kreş'} pasif edilsin mi?`,
      content: nextActive
        ? 'Kurum yöneticisi ve kullanıcıları panele tekrar giriş yapabilecek.'
        : 'Kurum yöneticisi ve kullanıcıları panele giriş yapamayacak. Veriler silinmez, istediğin zaman tekrar aktif edebilirsin.',
      okText: nextActive ? 'Evet, aktif et' : 'Evet, pasif et',
      cancelText: 'Vazgeç',
      okButtonProps: { danger: !nextActive },
      centered: true,
      onOk: async () => {
        if (togglingId) return;
        setTogglingId(record.id);
        try {
          await setInstitutionActive(record.id, nextActive);
          messageApi.success(nextActive ? 'Kurum aktif edildi.' : 'Kurum pasif edildi, erişim kapatıldı.');
          await load();
        } catch (e) {
          messageApi.error(e?.message || 'Durum güncellenemedi.');
        } finally {
          setTogglingId('');
        }
      },
    });
  };

  const columns = [
    {
      title: 'Kurum', key: 'name', render: (_, r) => (
        <div>
          <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 700 }} onClick={() => navigate(`/superadmin/kresler/${r.id}`)}>
            {r.ad || r.adSoyad || r.isim || r.kresAdi || 'İsimsiz kurum'}
          </Button>
          <br /><Text type="secondary" style={{ fontSize: 11 }}>{r.id}</Text>
        </div>
      )
    },
    { title: 'Konum', key: 'location', render: (_, r) => [r.il, r.ilce].filter(Boolean).join(' / ') || '—' },
    { title: 'Kullanıcı', key: 'users', align: 'center', render: (_, r) => data.usersByKres[r.id] || 0 },
    { title: 'Çocuk', key: 'children', align: 'center', render: (_, r) => data.childrenByKres[r.id] || 0 },
    { title: 'Sınıf', key: 'classes', align: 'center', render: (_, r) => data.classesByKres[r.id] || 0 },
    { title: 'Abonelik', key: 'subscription', render: (_, r) => data.subscriptionsByKres[r.id] ? <Tag color="green">Kayıt var</Tag> : <Tag>Yok</Tag> },
    { title: 'Durum', key: 'aktif', render: (_, r) => r.aktif === false ? <Tag color="red">Pasif</Tag> : <Tag color="green">Aktif</Tag> },
    {
      title: 'İşlem', key: 'actions', align: 'right', render: (_, r) => (
        <Space size={8}>
          <Button icon={<EyeOutlined />} onClick={() => navigate(`/superadmin/kresler/${r.id}`)}>Detay</Button>
          <Button icon={<PoweroffOutlined />} loading={togglingId === r.id} onClick={() => handleToggleActive(r)}>{r.aktif === false ? 'Aktif Et' : 'Pasif Et'}</Button>
          <Button danger icon={<DeleteOutlined />} loading={deletingId === r.id} onClick={() => handleDelete(r)}>Sil</Button>
        </Space>
      )
    },
  ];

  return <div style={{ maxWidth: 1500, margin: '0 auto' }}>
    {contextHolder}
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', marginBottom: 20 }}>
      <div><Title level={2} style={{ margin: 0 }}>Kreşler</Title><Text type="secondary">Platformdaki tüm kurumları ve temel durumlarını yönet.</Text></div>
      <Space>
        <Input allowClear prefix={<SearchOutlined />} placeholder="Kurum, il, telefon..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
        <Button icon={<ReloadOutlined />} onClick={load}>Yenile</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Kreş Ekle</Button>
      </Space>
    </div>
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Card style={card}><Table rowKey="id" columns={columns} dataSource={rows} loading={!data} pagination={{ pageSize: 20, showSizeChanger: false }} /></Card>

    <Modal
      title="Yeni Kreş Ekle"
      open={createOpen}
      onCancel={() => !saving && setCreateOpen(false)}
      okText="Kreşi Oluştur"
      cancelText="Vazgeç"
      confirmLoading={saving}
      width={720}
      centered
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={emptyForm} onFinish={handleCreate}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Form.Item name="ad" label="Kreş Adı" rules={[{ required: true, message: 'Kreş adı zorunlu.' }]}><Input placeholder="Örn. Minik Kalpler Kreşi" /></Form.Item>
          <Form.Item name="email" label="Kurum E-posta"><Input type="email" placeholder="info@kres.com" /></Form.Item>
          <Form.Item name="il" label="İl" rules={[{ required: true, message: 'İl zorunlu.' }]}><Input placeholder="Muğla" /></Form.Item>
          <Form.Item name="ilce" label="İlçe" rules={[{ required: true, message: 'İlçe zorunlu.' }]}><Input placeholder="Milas" /></Form.Item>
          <Form.Item name="telefon" label="Kurum Telefon"><Input placeholder="05xx xxx xx xx" /></Form.Item>
          <Form.Item name="adres" label="Adres"><Input placeholder="Mahalle / cadde / no" /></Form.Item>
        </div>

        <div style={{ borderTop: '1px solid #f0f0f0', margin: '4px 0 16px', paddingTop: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 12 }}>Kurum Yöneticisi</Text>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="yoneticiAd" label="Ad" rules={[{ required: true, message: 'Yönetici adı zorunlu.' }]}><Input placeholder="Yönetici adı" /></Form.Item>
            <Form.Item name="yoneticiSoyad" label="Soyad"><Input placeholder="Yönetici soyadı" /></Form.Item>
            <Form.Item name="yoneticiTelefon" label="Telefon"><Input placeholder="05xx xxx xx xx" /></Form.Item>
            <Form.Item name="kullaniciAdi" label="Kullanıcı Adı" rules={[{ required: true, message: 'Kullanıcı adı zorunlu.' }, { min: 3, message: 'En az 3 karakter.' }]}><Input autoComplete="off" placeholder="minikkalpler" /></Form.Item>
            <Form.Item name="sifre" label="Geçici Şifre" rules={[{ required: true, message: 'Şifre zorunlu.' }, { min: 6, message: 'En az 6 karakter.' }]}><Input.Password autoComplete="new-password" placeholder="En az 6 karakter" /></Form.Item>
            <Form.Item name="demoGun" label="Demo Gün Sayısı" rules={[{ required: true, message: 'Demo süresi zorunlu.' }]}><Input type="number" min={1} max={365} /></Form.Item>
          </div>
        </div>

        <Alert
          type="info"
          showIcon
          message="Oluşturulunca"
          description="Kreş kaydı, yönetici Firebase Auth hesabı, kullanıcı indexleri ve demo aboneliği birlikte oluşturulur."
        />
      </Form>
    </Modal>
  </div>;
}
