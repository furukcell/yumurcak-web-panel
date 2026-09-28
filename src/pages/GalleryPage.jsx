import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Typography, Button, Drawer, Form, Radio, Select, Input, Upload, message,
  Empty, Space, Popconfirm, Row, Col, Card, Tag, Modal, Spin,
} from 'antd';
import { PlusOutlined, DeleteOutlined, PlayCircleOutlined, InboxOutlined } from '@ant-design/icons';
import {
  ref, onValue, push, set, remove, query, orderByChild, equalTo,
} from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { database, storage } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { asArray } from '../utils/crudHelpers';

const { Title, Text } = Typography;
const { Dragger } = Upload;

// Mobildeki src/screens/shared/GalleryScreenBase.js (mode="admin") ile
// AYNI veri şeması: 'galeri' + 'kresGalerileri'/'sinifGalerileri'/'cocukGalerileri'
// index node'ları. Bu yüzden buradan yüklenen medya mobil tarafta veli/öğretmen
// ekranlarında da direkt görünür, ve mobilden yüklenenler burada da görünür.
// Storage yolu da birebir aynı: galeri/{kresId}/{galleryId}/{mediaId}.{ext}
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MEDIA_PER_POST = 10;
const MAX_VIDEO_PER_POST = 2;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toList(data) {
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data).map(([id, item]) => ({ id, ...safeObject(item) }));
}

function getChildName(child) {
  return `${child?.ad || child?.adSoyad || child?.isim || t('gallery.child')} ${child?.soyad || ''}`.trim();
}

function getClassName(classItem) {
  return classItem?.ad || classItem?.sinifAdi || classItem?.name || t('gallery.class');
}

function formatDateTime(timestamp) {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function remainingText(expiresAt, now) {
  const diff = Number(expiresAt || 0) - now;
  if (diff <= 0) return t('gallery.expired');
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.ceil((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours <= 0) return t('gallery.minutesLeft',{count:minutes});
  return t('gallery.hoursLeft',{hours,minutes});
}

function isVideoFile(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  return type.startsWith('video/') || /\.(mp4|mov|m4v|3gp|webm)$/i.test(name);
}

function getExtension(file, isVideo) {
  const name = String(file?.name || '');
  const raw = name.includes('.') ? name.split('.').pop() : '';
  return (raw || (isVideo ? 'mp4' : 'jpg')).toLowerCase();
}

function normalizeMediaItems(item) {
  const mediaItems = asArray(item?.mediaItems)
    .map((media) => safeObject(media))
    .filter((media) => media.url)
    .map((media, index) => ({
      id: media.id || `${item?.id || 'media'}-${index}`,
      type: media.type === 'video' ? 'video' : 'image',
      url: media.url,
      storagePath: media.storagePath || '',
    }));
  if (mediaItems.length > 0) return mediaItems;
  if (!item?.url) return [];
  return [{ id: `${item?.id || 'legacy'}-0`, type: item.type === 'video' ? 'video' : 'image', url: item.url, storagePath: item.storagePath || '' }];
}

function getGalleryTitle(item) {
  return item?.baslik || item?.title || item?.aciklama || item?.hedefAdi || t('gallery.share');
}

// Mobildeki AdminGalleryScreen.js'in web karşılığı — yönetici tüm kurum,
// bir sınıf veya tek bir çocuk hedefli fotoğraf/video paylaşabilir.
// Paylaşımlar 24 saat sonra otomatik "süresi doldu" olur; gerçek silme
// işini functions/index.js -> cleanupExpiredGalleryDaily (48 saat sonra) yapar.
export default function GalleryPage() {
  const { t } = useTranslation();
  const { kullanici, kres } = useAuth();
  const kresId = kres?.id || kullanici?.kresId;
  const userId = kullanici?.uid || kullanici?.id || '';
  const userName = `${kullanici?.ad || ''} ${kullanici?.soyad || ''}`.trim() || kullanici?.kullaniciAdi || t('gallery.admin');

  const [gallery, setGallery] = useState([]);
  const [siniflar, setSiniflar] = useState([]);
  const [cocuklar, setCocuklar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [targetType, setTargetType] = useState('kurum'); // kurum | sinif | cocuk
  const [selectedSinifId, setSelectedSinifId] = useState('');
  const [selectedCocukId, setSelectedCocukId] = useState('');
  const [caption, setCaption] = useState('');
  const [fileList, setFileList] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  const [viewer, setViewer] = useState(null); // { item, index }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!kresId) { setGallery([]); setLoading(false); return undefined; }
    const unsub = onValue(
      query(ref(database, 'galeri'), orderByChild('kresId'), equalTo(kresId)),
      (snap) => { setGallery(toList(snap.val())); setLoading(false); },
      () => { setGallery([]); setLoading(false); }
    );
    return () => unsub();
  }, [kresId]);

  useEffect(() => {
    if (!kresId) { setSiniflar([]); setCocuklar([]); return undefined; }
    const sinifUnsub = onValue(
      query(ref(database, 'siniflar'), orderByChild('kresId'), equalTo(kresId)),
      (snap) => setSiniflar(toList(snap.val()).sort((a, b) => getClassName(a).localeCompare(getClassName(b), 'tr'))),
      () => setSiniflar([])
    );
    const cocukUnsub = onValue(
      query(ref(database, 'cocuklar'), orderByChild('kresId'), equalTo(kresId)),
      (snap) => setCocuklar(toList(snap.val()).sort((a, b) => getChildName(a).localeCompare(getChildName(b), 'tr'))),
      () => setCocuklar([])
    );
    return () => { sinifUnsub(); cocukUnsub(); };
  }, [kresId]);

  const visibleGallery = useMemo(() => {
    return gallery
      .filter((item) => Number(item.expiresAt || 0) > now)
      .filter((item) => normalizeMediaItems(item).length > 0)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }, [gallery, now]);

  const uploadTarget = useMemo(() => {
    if (targetType === 'cocuk' && selectedCocukId) {
      const child = cocuklar.find((c) => c.id === selectedCocukId);
      return { hedef: 'cocuk', targetType: 'student', classId: child?.sinifId || '', studentId: child?.id || '', cocukIds: child ? [child.id] : [], label: child ? getChildName(child) : t('gallery.selectedChild') };
    }
    if (targetType === 'sinif' && selectedSinifId) {
      const sinif = siniflar.find((s) => s.id === selectedSinifId);
      const sinifCocuklari = cocuklar.filter((c) => c.sinifId === selectedSinifId);
      return { hedef: 'sinif', targetType: 'class', classId: selectedSinifId, studentId: '', cocukIds: sinifCocuklari.map((c) => c.id), label: sinif ? getClassName(sinif) : t('gallery.selectedClass') };
    }
    return { hedef: 'kurum', targetType: 'school', classId: '', studentId: '', cocukIds: [], label: t('gallery.allInstitution') };
  }, [cocuklar, selectedCocukId, selectedSinifId, siniflar, targetType]);

  const openCreate = () => {
    setTargetType('kurum');
    setSelectedSinifId('');
    setSelectedCocukId('');
    setCaption('');
    setFileList([]);
    setDrawerOpen(true);
  };

  const handleFileChange = ({ fileList: newList }) => {
    setFileList(newList.slice(0, MAX_MEDIA_PER_POST));
  };

  async function handleUpload() {
    if (fileList.length === 0) { message.error(t('gallery.selectMedia')); return; }
    if (fileList.length > MAX_MEDIA_PER_POST) { message.error(t('gallery.maxMedia',{count:MAX_MEDIA_PER_POST})); return; }
    const videoCount = fileList.filter((f) => isVideoFile(f.originFileObj || f)).length;
    if (videoCount > MAX_VIDEO_PER_POST) { message.error(t('gallery.maxVideo',{count:MAX_VIDEO_PER_POST})); return; }
    if (targetType === 'sinif' && !selectedSinifId) { message.error(t('gallery.selectClass')); return; }
    if (targetType === 'cocuk' && !selectedCocukId) { message.error(t('gallery.selectChild')); return; }
    if (!kresId) { message.error(t('gallery.noInstitution')); return; }

    setUploading(true);
    try {
      const itemRef = push(ref(database, 'galeri'));
      const galleryId = itemRef.key;
      const createdAt = Date.now();
      const mediaItems = [];

      for (let index = 0; index < fileList.length; index += 1) {
        const file = fileList[index].originFileObj || fileList[index];
        const isVideo = isVideoFile(file);

        if (isVideo && file.size > MAX_VIDEO_SIZE_BYTES) {
          throw new Error(`"${file.name}" 50 MB sınırını aşıyor. Lütfen daha küçük bir video seç.`);
        }

        setUploadStatus(`${t('gallery.uploading')} (${index + 1}/${fileList.length})`);
        const extension = getExtension(file, isVideo);
        const mediaId = `${galleryId}-${index}`;
        const storagePath = `galeri/${kresId}/${galleryId}/${mediaId}.${extension}`;
        const fileRef = storageRef(storage, storagePath);
        await uploadBytes(fileRef, file, { contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg') });
        const url = await getDownloadURL(fileRef);

        mediaItems.push({
          id: mediaId,
          type: isVideo ? 'video' : 'image',
          url,
          thumbnailUrl: '',
          storagePath,
          fileName: file.name || `${mediaId}.${extension}`,
          fileSize: file.size || 0,
        });
      }

      const galleryRecord = {
        kresId,
        targetType: uploadTarget.targetType,
        classId: uploadTarget.classId || '',
        studentId: uploadTarget.studentId || '',
        sinifId: uploadTarget.classId || '',
        cocukId: uploadTarget.studentId || '',
        cocukIds: uploadTarget.cocukIds || [],
        hedef: uploadTarget.hedef,
        hedefAdi: uploadTarget.label,
        type: mediaItems[0]?.type || 'image',
        url: mediaItems[0]?.url || '',
        storagePath: mediaItems[0]?.storagePath || '',
        mediaItems,
        mediaCount: mediaItems.length,
        aciklama: caption.trim(),
        yukleyenId: userId,
        yukleyenAd: userName,
        yukleyenRol: 'yonetici',
        createdAt,
        expiresAt: createdAt + DAY_MS,
      };

      await set(itemRef, galleryRecord);
      await Promise.all([
        set(ref(database, `kresGalerileri/${kresId}/${galleryId}`), true),
        galleryRecord.classId ? set(ref(database, `sinifGalerileri/${galleryRecord.classId}/${galleryId}`), true) : Promise.resolve(),
        ...asArray(galleryRecord.cocukIds).map((childId) => set(ref(database, `cocukGalerileri/${childId}/${galleryId}`), true)),
      ]);

      message.success(`${uploadTarget.label} için ${mediaItems.length} medya yüklendi. 24 saat boyunca galeride görünecek.`);
      setDrawerOpen(false);
    } catch (error) {
      console.error('Galeri yüklemesi yapılamadı:', error);
      message.error(error?.message || t('gallery.uploadError'));
    } finally {
      setUploadStatus('');
      setUploading(false);
    }
  }

  async function handleDelete(item) {
    try {
      const mediaItems = normalizeMediaItems(item);
      await remove(ref(database, `galeri/${item.id}`));
      await Promise.all([
        remove(ref(database, `kresGalerileri/${item.kresId}/${item.id}`)).catch(() => null),
        item.classId || item.sinifId ? remove(ref(database, `sinifGalerileri/${item.classId || item.sinifId}/${item.id}`)).catch(() => null) : Promise.resolve(),
        ...asArray(item.cocukIds || item.cocukId || item.studentId).map((childId) => remove(ref(database, `cocukGalerileri/${childId}/${item.id}`)).catch(() => null)),
        ...mediaItems.map((media) => (media.storagePath ? deleteObject(storageRef(storage, media.storagePath)).catch(() => null) : Promise.resolve(null))),
      ]);
      message.success(t('gallery.deleted'));
      if (viewer?.item?.id === item.id) setViewer(null);
    } catch (error) {
      console.error(error);
      message.error(t('gallery.deleteError'));
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>{t('gallery.title')}</Title>
          <Text type="secondary">{visibleGallery.length} aktif paylaşım · Yüklenenler 24 saat görünür kalır</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('gallery.upload')}</Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : visibleGallery.length === 0 ? (
        <Empty description={t('gallery.empty')} style={{ padding: 60 }} />
      ) : (
        <Row gutter={[16, 16]}>
          {visibleGallery.map((item) => {
            const mediaItems = normalizeMediaItems(item);
            const first = mediaItems[0];
            return (
              <Col xs={24} sm={12} lg={8} xl={6} key={item.id}>
                <Card
                  hoverable
                  onClick={() => setViewer({ item, index: 0 })}
                  cover={
                    <div style={{ position: 'relative', height: 180, background: '#171821', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {first?.type === 'video' ? (
                        <>
                          <video src={first.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                          <PlayCircleOutlined style={{ position: 'absolute', fontSize: 40, color: '#fff' }} />
                        </>
                      ) : (
                        <img src={first?.url} alt={getGalleryTitle(item)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                      {mediaItems.length > 1 && (
                        <Tag color={THEME.primary} style={{ position: 'absolute', top: 8, right: 8, border: 'none' }}>{mediaItems.length} medya</Tag>
                      )}
                    </div>
                  }
                  styles={{ body: { padding: 12 } }}
                  actions={[
                    <Popconfirm key="del" title={t('gallery.deleteTitle')} okText={t('gallery.delete')} cancelText={t('gallery.cancel')} okButtonProps={{ danger: true }} onConfirm={(e) => { e?.stopPropagation?.(); handleDelete(item); }} onCancel={(e) => e?.stopPropagation?.()}>
                      <span onClick={(e) => e.stopPropagation()}><DeleteOutlined /> Sil</span>
                    </Popconfirm>,
                  ]}
                >
                  <Text strong ellipsis style={{ display: 'block' }}>{getGalleryTitle(item)}</Text>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>Hedef: {item.hedefAdi || '-'}</Text>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{item.yukleyenAd || t('gallery.unknown')} · {formatDateTime(item.createdAt)}</Text>
                  <Tag style={{ marginTop: 8 }} color="purple">⏳ {remainingText(item.expiresAt, now)}</Tag>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Drawer
        title={t('gallery.upload')}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={440}
        extra={<Button type="primary" loading={uploading} onClick={handleUpload}>{uploading ? (uploadStatus || t('gallery.loading')) : t('gallery.uploadShort')}</Button>}
      >
        <Form layout="vertical">
          <Form.Item label={t('gallery.shareTo')}>
            <Radio.Group value={targetType} onChange={(e) => setTargetType(e.target.value)} style={{ width: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Radio value="kurum">Tüm Kurum</Radio>
                <Radio value="sinif">{t('gallery.specificClass')}</Radio>
                <Radio value="cocuk">{t('gallery.specificChild')}</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          {targetType === 'sinif' && (
            <Form.Item label={t('gallery.selectClassLabel')}>
              <Select
                placeholder={t('gallery.selectClass')}
                value={selectedSinifId || undefined}
                onChange={setSelectedSinifId}
                options={siniflar.map((s) => ({ value: s.id, label: getClassName(s) }))}
                notFoundContent={t('gallery.noClass')}
              />
            </Form.Item>
          )}

          {targetType === 'cocuk' && (
            <Form.Item label={t('gallery.selectChildLabel')}>
              <Select
                placeholder={t('gallery.selectChild')}
                value={selectedCocukId || undefined}
                onChange={setSelectedCocukId}
                showSearch
                optionFilterProp="label"
                options={cocuklar.map((c) => ({ value: c.id, label: getChildName(c) }))}
                notFoundContent={t('gallery.noChild')}
              />
            </Form.Item>
          )}

          <Form.Item label={t('gallery.caption')}>
            <Input.TextArea rows={3} placeholder={t('gallery.captionPlaceholder')} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </Form.Item>

          <Form.Item label={`Fotoğraf / Video (en fazla ${MAX_MEDIA_PER_POST}, en fazla ${MAX_VIDEO_PER_POST} video)`}>
            <Dragger
              multiple
              accept="image/*,video/*"
              fileList={fileList}
              beforeUpload={() => false}
              onChange={handleFileChange}
              listType="picture"
              disabled={uploading}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">{t('gallery.dragText')}</p>
              <p className="ant-upload-hint">{t('gallery.videoHint')}</p>
            </Dragger>
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        open={!!viewer}
        onCancel={() => setViewer(null)}
        footer={null}
        width={720}
        centered
        title={viewer ? getGalleryTitle(viewer.item) : ''}
      >
        {viewer && (() => {
          const mediaItems = normalizeMediaItems(viewer.item);
          const active = mediaItems[viewer.index] || mediaItems[0];
          return (
            <div>
              <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 360 }}>
                {active?.type === 'video' ? (
                  <video src={active.url} controls style={{ width: '100%', maxHeight: 480 }} />
                ) : (
                  <img src={active?.url} alt="" style={{ width: '100%', maxHeight: 480, objectFit: 'contain' }} />
                )}
              </div>
              {mediaItems.length > 1 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto', paddingBottom: 4 }}>
                  {mediaItems.map((media, idx) => (
                    <div
                      key={media.id}
                      onClick={() => setViewer({ item: viewer.item, index: idx })}
                      style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0, cursor: 'pointer', border: idx === viewer.index ? `2px solid ${THEME.primary}` : '2px solid transparent', background: '#171821', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {media.type === 'video' ? <PlayCircleOutlined style={{ color: '#fff' }} /> : <img src={media.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Hedef: {viewer.item.hedefAdi || '-'} · {viewer.item.yukleyenAd || ''}</Text>
                <Popconfirm title={t('gallery.deleteTitle')} okText={t('gallery.delete')} cancelText={t('gallery.cancel')} okButtonProps={{ danger: true }} onConfirm={() => handleDelete(viewer.item)}>
                  <Button danger icon={<DeleteOutlined />} size="small">{t('gallery.delete')}</Button>
                </Popconfirm>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
