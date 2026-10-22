// Phone photos are often 5-10 MB. Shrink them before upload: faster on mobile data, and well under the 8 MB limit.

export const MAX_BYTES = 8 * 1024 * 1024;

export type Prepared = { blob: Blob; name: string };

export async function prepareFile(file: File, allowPdf: boolean): Promise<Prepared> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    if (!allowPdf) throw new Error('Please choose a photo (JPG, PNG or WebP).');
    if (file.size > MAX_BYTES) throw new Error('This PDF is larger than 8 MB. Please choose a smaller file.');
    return { blob: file, name: file.name };
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error(allowPdf ? 'Please choose a JPG, PNG, WebP or PDF file.' : 'Please choose a photo (JPG, PNG or WebP).');
  }
  try {
    const shrunk = await shrink(file);
    if (shrunk.size > MAX_BYTES) throw new Error('This photo is too large. Please choose a smaller one.');
    return { blob: shrunk, name: 'photo.jpg' };
  } catch (error) {
    // Could not re-encode (unusual format): send the original if it is small enough.
    if (file.size <= MAX_BYTES && !(error instanceof Error && error.message.includes('too large'))) return { blob: file, name: file.name };
    throw error instanceof Error ? error : new Error('Could not read this photo. Please try another.');
  }
}

async function shrink(file: File, maxSide = 2000, quality = 0.85): Promise<Blob> {
  if (file.size < 1_200_000) {
    // Small enough already: still decode once so a broken file fails here, with a clear message.
    const probe = await createImageBitmap(file);
    probe.close();
    return file;
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('no blob');
  return blob;
}
