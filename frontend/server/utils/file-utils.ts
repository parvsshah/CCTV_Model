// frontend/server/utils/file-utils.ts
import fs from 'fs/promises';

export async function detectFileExtension(filePath: string): Promise<string | null> {
  try {
    const buffer = Buffer.alloc(12);
    const fd = await fs.open(filePath, 'r');
    await fd.read(buffer, 0, 12, 0);
    await fd.close();

    // Check for common video file signatures
    const signatures: { [key: string]: number[][] } = {
      '.mp4': [
        [0x66, 0x74, 0x79, 0x70], // 'ftyp'
        [0x6D, 0x70, 0x34, 0x32], // 'mp42'
        [0x69, 0x73, 0x6F, 0x6D], // 'isom'
      ],
      '.avi': [[0x52, 0x49, 0x46, 0x46]], // 'RIFF'
      '.mov': [[0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]], // 'ftypqt  '
      '.mkv': [[0x1A, 0x45, 0xDF, 0xA3]], // '\x1A\x45\xDF\xA3'
      '.webm': [[0x1A, 0x45, 0xDF, 0xA3]], // Same as MKV
      '.wmv': [[0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11]], // ASF header
      '.flv': [[0x46, 0x4C, 0x56, 0x01]], // 'FLV\x01'
      '.m4v': [[0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]], // MP4/M4V
      '.mpg': [[0x00, 0x00, 0x01, 0xBA]], // MPEG-PS
      '.mpeg': [[0x00, 0x00, 0x01, 0xBA]], // Same as MPG
    };

    for (const [ext, sigs] of Object.entries(signatures)) {
      for (const sig of sigs) {
        if (buffer.slice(0, sig.length).equals(Buffer.from(sig))) {
          return ext;
        }
      }
    }
  } catch (error) {
    console.error('Error detecting file extension:', error);
  }
  return null;
}