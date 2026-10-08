import { useEffect, useRef, useState } from 'react';

// Official "Sign in with Google" button (Google Identity Services).
// Google gives the browser a signed ID token; our backend verifies it with Google.
export default function GoogleButton({ clientId, onCredential, onError }) {
  const box = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (box.current) setWidth(Math.min(400, Math.floor(box.current.offsetWidth)));
  }, []);

  useEffect(() => {
    if (!clientId || !width) return;
    const render = () => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (res) => onCredential(res.credential),
        ux_mode: 'popup',
      });
      window.google.accounts.id.renderButton(box.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width,
      });
    };
    if (window.google?.accounts?.id) return render();
    let script = document.getElementById('gsi-script');
    if (!script) {
      script = document.createElement('script');
      script.id = 'gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', render);
    script.addEventListener('error', () => onError?.('Could not load Google sign-in. Check your internet connection.'));
    return () => script.removeEventListener('load', render);
  }, [clientId, width, onCredential, onError]);

  if (!clientId) {
    return (
      <button type="button" disabled className="flex w-full items-center justify-center gap-3 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-400">
        <GoogleIcon /> Sign in with Google (not set up yet)
      </button>
    );
  }
  return <div ref={box} className="flex min-h-[44px] w-full justify-center" />;
}

export function GoogleIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GmailIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#4caf50" d="M45 16.2l-5 2.75-5 4.75V40h7c1.66 0 3-1.34 3-3V16.2z" />
      <path fill="#1e88e5" d="M3 16.2l3.61 1.71L13 23.7V40H6c-1.66 0-3-1.34-3-3V16.2z" />
      <path fill="#e53935" d="M35 11.2L24 19.45 13 11.2 12 17l1 6.7 11 8.25 11-8.25 1-6.7z" />
      <path fill="#c62828" d="M3 12.3v3.9l10 7.5V11.2L9.88 8.86C9.08 8.3 8.12 8 7.14 8 4.85 8 3 9.85 3 12.14v.16z" />
      <path fill="#fbc02d" d="M45 12.3v3.9l-10 7.5V11.2l3.12-2.34c.8-.56 1.76-.86 2.74-.86 2.29 0 4.14 1.85 4.14 4.14v.16z" />
    </svg>
  );
}
