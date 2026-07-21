import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import {
  classroomIdSchema,
  interestRewardMediaSchema,
  studentIdSchema,
  type InterestRewardMedia,
} from '@/lib/domain';
import { storage } from '@/lib/firebase';

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const AUDIO_MAX_BYTES = 20 * 1024 * 1024;

const supportedMimeType = (file: File): InterestRewardMedia['kind'] => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  throw new Error('Choose an image or audio file.');
};

const safeFileName = (fileName: string) => {
  const normalized = fileName
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return normalized || 'encouragement-media';
};

export const uploadInterestRewardMedia = async ({
  classroomId: rawClassroomId,
  studentId: rawStudentId,
  file,
}: Readonly<{
  classroomId: string;
  studentId: string;
  file: File;
}>): Promise<InterestRewardMedia> => {
  const classroomId = classroomIdSchema.parse(rawClassroomId);
  const studentId = studentIdSchema.parse(rawStudentId);
  const kind = supportedMimeType(file);
  const maxBytes = kind === 'image' ? IMAGE_MAX_BYTES : AUDIO_MAX_BYTES;
  if (file.size === 0) throw new Error('The selected file is empty.');
  if (file.size > maxBytes) {
    throw new Error(
      `${kind === 'image' ? 'Images' : 'Audio clips'} must be ${maxBytes / 1024 / 1024} MB or smaller.`,
    );
  }

  const id = crypto.randomUUID();
  const storagePath = `classrooms/${classroomId}/students/${studentId}/interest-rewards/${id}-${safeFileName(file.name)}`;
  await uploadBytes(ref(storage, storagePath), file, {
    contentType: file.type,
    customMetadata: { classroomId, studentId, purpose: 'interest-reward' },
  });

  return interestRewardMediaSchema.parse({
    id,
    kind,
    storagePath,
    fileName: file.name.slice(0, 120),
    mimeType: file.type,
  });
};

export const getInterestRewardMediaUrl = (storagePath: string) =>
  getDownloadURL(ref(storage, storagePath));
