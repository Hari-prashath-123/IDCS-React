import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
// no expected image preview — scanner accepts any detected QR

export default function GatepassScan() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const info = useMemo(() => {
    const act = (params.get('act') || '').toLowerCase();
    const sid = params.get('sid') || '';
    const appid = params.get('appid') || '';
    const when = new Date();
    const actionText = act === 'out' ? 'OUT' : act === 'in' ? 'IN' : 'UNKNOWN';
    return { act, sid, appid, when, actionText };
  }, [params]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scannedValue, setScannedValue] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Start camera + barcode detector if available
    let stream: MediaStream | null = null;
    const detector: any = (window as any).BarcodeDetector ? new (window as any).BarcodeDetector({ formats: ['qr_code', 'ean_13', 'code_128'] }) : null;
    let rafId: number | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let jsqr: any = null;

    async function start() {
      setMessage(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Primary: BarcodeDetector
        if (detector && videoRef.current) {
          const scanLoop = async () => {
            if (done) return;
            try {
              const detections = await detector.detect(videoRef.current as HTMLVideoElement);
              if (detections && detections.length > 0) {
                const raw = detections[0].rawValue || detections[0].rawData;
                handleScanned(String(raw));
                return;
              }
            } catch (e) {
              // ignore detection errors from BarcodeDetector and fall through to canvas fallback
            }
            rafId = requestAnimationFrame(scanLoop);
          };
          rafId = requestAnimationFrame(scanLoop);
        } else if (videoRef.current) {
          // Fallback: canvas + jsQR
          try {
            // create offscreen canvas
            canvas = document.createElement('canvas');
            ctx = canvas.getContext('2d');
            // dynamic import of jsqr so the bundle doesn't require it unless needed
            const maybe = await import('jsqr').catch(() => null);
            jsqr = maybe?.default || maybe || null;
            if (!jsqr) {
              setMessage('No BarcodeDetector available. Install package `jsqr` (npm i jsqr) for canvas fallback, or use a browser with BarcodeDetector.');
              return;
            }

            const scanCanvasLoop = async () => {
              if (done) return;
              try {
                const video = videoRef.current as HTMLVideoElement;
                if (video.videoWidth === 0 || video.videoHeight === 0) {
                  rafId = requestAnimationFrame(scanCanvasLoop);
                  return;
                }
                canvas!.width = video.videoWidth;
                canvas!.height = video.videoHeight;
                ctx!.drawImage(video, 0, 0, canvas!.width, canvas!.height);
                const imageData = ctx!.getImageData(0, 0, canvas!.width, canvas!.height);
                const code = jsqr(imageData.data, imageData.width, imageData.height);
                if (code && code.data) {
                  handleScanned(String(code.data));
                  return;
                }
              } catch (e) {
                // ignore per-frame errors
              }
              rafId = requestAnimationFrame(scanCanvasLoop);
            };
            rafId = requestAnimationFrame(scanCanvasLoop);
          } catch (err) {
            console.warn('Canvas fallback init failed', err);
            setMessage('Scanner fallback failed to initialize. Please enter student id manually.');
            return;
          }
        }
      } catch (err: any) {
        console.error('Camera start failed', err);
        setMessage('Unable to access camera. You can enter student id manually below.');
      }
    }

    start();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      // scanning state not used
    };
  }, []);

  const handleScanned = async (_val: string) => {
    // Scanner-only flow: ignore QR payload contents and update using info.sid and info.appid
    if (done) return;
    setScannedValue(_val);
    setMessage('Detected. Saving scan time...');
    try {
      const rpcName = 'record_gatepass_scan';
      const paramsRpc: any = { p_application_id: info.appid, p_action: info.act, p_student_id: info.sid };
      const { data: rpcData, error: rpcErr } = await supabase.rpc(rpcName, paramsRpc);
        if (rpcErr) {
        console.warn('RPC error, falling back to direct update', rpcErr);
        const column = info.act === 'out' ? { out_time: new Date().toISOString() } : { in_time: new Date().toISOString() };
        const { error } = await supabase.from('gatepass_applications').update(column).eq('id', info.appid);
        if (error) throw error;
        const { data: refreshed, error: fetchErr } = await supabase.from('gatepass_applications').select('id,updated_at,out_time,in_time').eq('id', info.appid).single();
        if (fetchErr) throw fetchErr;
        setResult(refreshed);
        setMessage('Saved using fallback update.');
        setDone(true);
        const s = videoRef.current?.srcObject as MediaStream | null;
        s?.getTracks().forEach(t => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
          try {
            // Notify parent window (opened iframe) that scan completed so parent UI can refresh
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ type: 'gatepass-scan-complete', appid: info.appid, action: info.act, result: refreshed }, window.location.origin);
            }
          } catch (e) {
            // ignore
          }
      } else {
        const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (!row || (!row.out_time && !row.in_time)) {
          const { data: refreshed, error: fetchErr } = await supabase.from('gatepass_applications').select('id,updated_at,out_time,in_time').eq('id', info.appid).single();
          if (fetchErr) throw fetchErr;
          setResult(refreshed);
        } else {
          setResult(row);
        }
        setMessage('Scan saved successfully.');
        setDone(true);
        const s = videoRef.current?.srcObject as MediaStream | null;
        s?.getTracks().forEach(t => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ type: 'gatepass-scan-complete', appid: info.appid, action: info.act, result: row }, window.location.origin);
            }
          } catch (e) {
            // ignore
          }
      }
    } catch (e: any) {
      console.error('Save failed', e);
      setMessage('Failed to save scan: ' + (e?.message || String(e)));
    }
  };

  // manualSave removed for scanner-only flow

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 max-w-lg w-full">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Gatepass Scan</h1>
        <p className="text-slate-600 mb-4">{info.actionText} — Scan student QR now</p>

        <div className="mb-4">
          <div className="w-full max-w-md mx-auto" style={{ position: 'relative' }}>
            {/* Square container: padding-bottom 100% keeps it a square */}
            <div style={{ width: '100%', paddingBottom: '100%', background: '#000', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
              <video ref={videoRef} className="absolute top-0 left-0" style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />

              {/* centered square overlay to indicate scan area; color changes for IN/OUT */}
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '64%', height: '64%', boxSizing: 'border-box', border: `4px solid ${info.act === 'in' ? 'rgba(16,185,129,0.95)' : 'rgba(59,130,246,0.95)'}`, borderRadius: 12, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>
                <div style={{ position: 'absolute', top: -30, background: 'rgba(0,0,0,0.55)', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>{info.actionText}</div>
              </div>
            </div>

            {/* no expected preview — accept any QR */}
          </div>
        </div>

        {message && <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">{message}</div>}

        {/* match indicator */}
        <div className="mb-3">
          {scannedValue ? (
            <div className="flex items-center gap-2 text-sm">
              <div style={{ width: 12, height: 12, borderRadius: 12, background: '#10b981' }} />
              <div className="text-slate-600">Detected: {scannedValue}</div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">No scan detected yet</div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-sm text-slate-600">Scanner active — present QR inside the box. The scanner will record the {info.actionText} time automatically.</div>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                try {
                  // Prefer navigating back in history; fall back to the student's gatepass page
                  if (window.history.length > 1) {
                    navigate(-1);
                  } else {
                    navigate('/student/gatepass');
                  }
                } catch (err) {
                  navigate('/student/gatepass');
                }
              }}
              className="flex-1 px-4 py-2 bg-gray-200 rounded-lg text-center"
            >
              Close
            </button>
          </div>
        </div>

        {result && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
            Saved at {new Date(result.updated_at || Date.now()).toLocaleString()}
            <div className="text-xs text-slate-600">out_time: {result.out_time || '—' }, in_time: {result.in_time || '—'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
