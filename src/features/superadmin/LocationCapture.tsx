import { Crosshair, ExternalLink, Loader2, MapPin, MapPinOff, Pencil, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { GeoLocation } from '@/types';

interface Props {
  value?: GeoLocation;
  onChange: (value: GeoLocation | undefined) => void;
}

const ERRORS: Record<number, string> = {
  1: 'Location permission was denied. Allow location access for this site in your browser settings, or enter the coordinates manually.',
  2: 'Your device could not determine its position. Move closer to a window or enable GPS / Wi-Fi, then try again.',
  3: 'Getting the location took too long. Please try again.',
};

/** Captures the business premises' position from the device, or lets you type it in. */
export function LocationCapture({ value, onChange }: Props) {
  const [status, setStatus] = useState<'idle' | 'locating' | 'error'>('idle');
  const [error, setError] = useState('');
  const [manual, setManual] = useState(false);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [alt, setAlt] = useState('');

  const capture = () => {
    if (!('geolocation' in navigator)) {
      setStatus('error');
      setError('This browser does not support location access. Enter the coordinates manually.');
      return;
    }
    setStatus('locating');
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus('idle');
        setManual(false);
        onChange({
          latitude: +pos.coords.latitude.toFixed(6),
          longitude: +pos.coords.longitude.toFixed(6),
          altitude: pos.coords.altitude === null ? null : +pos.coords.altitude.toFixed(1),
          accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
          capturedAt: new Date().toISOString(),
          source: 'device',
        });
      },
      (err) => {
        setStatus('error');
        setError(ERRORS[err.code] ?? 'Could not get the location. Please try again.');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const latN = Number(lat);
  const lngN = Number(lng);
  const manualValid = lat !== '' && lng !== '' && latN >= -90 && latN <= 90 && lngN >= -180 && lngN <= 180;

  const saveManual = () => {
    if (!manualValid) return;
    onChange({ latitude: +latN.toFixed(6), longitude: +lngN.toFixed(6), altitude: alt === '' ? null : Number(alt), accuracy: null, capturedAt: new Date().toISOString(), source: 'manual' });
    setManual(false);
  };

  const startManual = () => {
    setLat(value ? String(value.latitude) : '');
    setLng(value ? String(value.longitude) : '');
    setAlt(value?.altitude != null ? String(value.altitude) : '');
    setManual(true);
  };

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', value ? 'bg-success-soft text-success' : 'bg-primary-light text-primary')}>
          {value ? <MapPin className="h-5 w-5" /> : <Crosshair className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">{value ? 'Location captured' : 'Business location'}</p>
          <p className="text-xs text-muted-foreground">
            {value
              ? `${value.source === 'device' ? 'From this device' : 'Entered manually'} · ${formatDateTime(value.capturedAt)}`
              : 'Stand at the business premises and capture the live location from this device.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={capture} loading={status === 'locating'} variant={value ? 'secondary' : 'primary'}>
            {status !== 'locating' && (value ? <RotateCcw /> : <Crosshair />)} {value ? 'Re-capture' : 'Capture current location'}
          </Button>
          <Button type="button" variant="ghost" onClick={startManual}><Pencil /> Enter manually</Button>
        </div>
      </div>

      {status === 'locating' && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for your device’s location… allow the permission prompt if your browser asks.</p>
      )}
      {status === 'error' && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger" role="alert"><MapPinOff className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}</p>
      )}

      {value && !manual && (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Latitude', value.latitude.toFixed(6)],
            ['Longitude', value.longitude.toFixed(6)],
            ['Altitude', value.altitude === null ? 'Not reported' : `${value.altitude} m`],
            ['Accuracy', value.accuracy === null ? '—' : `± ${value.accuracy} m`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <dt className="text-2xs uppercase tracking-wider text-subtle">{k}</dt>
              <dd className="tabular mt-0.5 text-[13px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {value && !manual && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <a href={`https://www.google.com/maps?q=${value.latitude},${value.longitude}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Open in Google Maps
          </a>
          {value.altitude === null && <span className="text-subtle">Altitude is only available on devices with GPS (most phones).</span>}
          <button type="button" onClick={() => onChange(undefined)} className="ml-auto text-subtle hover:text-danger">Clear location</button>
        </div>
      )}

      {manual && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5"><Label htmlFor="lat">Latitude</Label><Input id="lat" value={lat} onChange={(e) => setLat(e.target.value.replace(/[^\d.-]/g, ''))} placeholder="19.076090" inputMode="decimal" /></div>
          <div className="space-y-1.5"><Label htmlFor="lng">Longitude</Label><Input id="lng" value={lng} onChange={(e) => setLng(e.target.value.replace(/[^\d.-]/g, ''))} placeholder="72.877426" inputMode="decimal" /></div>
          <div className="space-y-1.5"><Label htmlFor="alt">Altitude (m, optional)</Label><Input id="alt" value={alt} onChange={(e) => setAlt(e.target.value.replace(/[^\d.-]/g, ''))} placeholder="14" inputMode="decimal" /></div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setManual(false)}>Cancel</Button>
            <Button type="button" onClick={saveManual} disabled={!manualValid}>Save</Button>
          </div>
          {(lat !== '' || lng !== '') && !manualValid && <p className="text-xs text-danger sm:col-span-4">Latitude must be between −90 and 90, longitude between −180 and 180.</p>}
        </div>
      )}
    </div>
  );
}
