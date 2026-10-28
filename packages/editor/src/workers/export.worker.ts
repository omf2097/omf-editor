// Animation export off the main thread (spec 20 §3): render, encode, post the bytes back.

import { runExport, type ExportJob, type ExportMessage } from '../lib/animExport';

const post = (m: ExportMessage): void => {
  if (m.type === 'done') self.postMessage(m, { transfer: [m.bytes.buffer as ArrayBuffer] });
  else self.postMessage(m);
};

self.onmessage = (e: MessageEvent<ExportJob>) => runExport(e.data, post);
