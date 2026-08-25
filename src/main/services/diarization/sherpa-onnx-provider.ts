import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import type { DiarizationSegment } from '@shared/types'
import type { SpeakerDiarizationProvider, SpeakerDiarizationProviderRequest } from './provider'

const require = createRequire(import.meta.url)

const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
function readPreparedWave(path) {
  const buffer = fs.readFileSync(path);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Prepared diarization audio is not a WAV file.');
  let offset = 12;
  let format = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ') format = { code: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), sampleRate: buffer.readUInt32LE(start + 4), bits: buffer.readUInt16LE(start + 14) };
    if (id === 'data') { data = { start, size: Math.min(size, buffer.length - start) }; break; }
    offset = start + size + (size % 2);
  }
  if (!format || !data || format.channels !== 1 || format.sampleRate !== 16000 || format.code !== 1 || format.bits !== 16) throw new Error('Prepared diarization audio must be mono 16 kHz signed 16-bit PCM.');
  const samples = new Float32Array(Math.floor(data.size / 2));
  for (let index = 0; index < samples.length; index += 1) samples[index] = buffer.readInt16LE(data.start + index * 2) / 32768;
  return samples;
}
try {
  const sherpa = require(workerData.modulePath);
  const diarizer = new sherpa.OfflineSpeakerDiarization({
    segmentation: { pyannote: { model: workerData.segmentationModelPath } },
    embedding: { model: workerData.embeddingModelPath },
    clustering: { numClusters: workerData.speakerCount, threshold: 0.5 },
    minDurationOn: 0.3,
    minDurationOff: 0.5,
    numThreads: 2,
    provider: 'cpu',
    debug: false
  });
  const samples = readPreparedWave(workerData.audioPath);
  parentPort.postMessage({ ok: true, segments: diarizer.process(samples) });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
}
`

export class SherpaOnnxDiarizationProvider implements SpeakerDiarizationProvider {
  readonly id = 'sherpa-onnx' as const
  readonly version = '1.13.6-pyannote3-eres2net-v1'
  private workers = new Set<Worker>()

  async diarize(request: SpeakerDiarizationProviderRequest): Promise<DiarizationSegment[]> {
    if (request.signal.aborted) throw new Error('Speaker detection cancelled.')
    const modulePath = require.resolve('sherpa-onnx-node')
    const speakerCount = request.speakerCount === 'auto' ? 0 : Math.max(1, Math.min(20, Number(request.speakerCount)))
    const worker = new Worker(workerSource, { eval: true, workerData: {
      modulePath, audioPath: request.audioPath, segmentationModelPath: request.segmentationModelPath,
      embeddingModelPath: request.embeddingModelPath, speakerCount
    } })
    this.workers.add(worker)
    return new Promise<DiarizationSegment[]>((resolve, reject) => {
      const abort = (): void => { void worker.terminate(); reject(new Error('Speaker detection cancelled.')) }
      request.signal.addEventListener('abort', abort, { once: true })
      worker.once('message', (message: { ok: boolean; segments?: Array<{ speaker: number; start: number; end: number }>; error?: string }) => {
        request.signal.removeEventListener('abort', abort)
        this.workers.delete(worker)
        void worker.terminate()
        if (!message.ok) { reject(new Error(message.error ?? 'Speaker detection failed.')); return }
        resolve((message.segments ?? []).filter((segment) => segment.end > segment.start).map((segment) => ({
          id: randomUUID(), speakerId: `${request.sourceClipId}:speaker-${segment.speaker + 1}`,
          overlappingSpeakerIds: [], start: segment.start, end: segment.end, confidence: null
        })))
      })
      worker.once('error', (error) => { request.signal.removeEventListener('abort', abort); this.workers.delete(worker); reject(error) })
    })
  }

  async release(): Promise<void> {
    await Promise.all([...this.workers].map((worker) => worker.terminate()))
    this.workers.clear()
  }
}
