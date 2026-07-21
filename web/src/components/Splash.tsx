import { useEffect, useState } from "react";

/**
 * Full-screen intro splash: the Arc Legacy medallion front and center with a
 * pulsing glow ring, then fades out and unmounts. Shown once per page load.
 */
export function Splash() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDone(true), 2600);
    return () => clearTimeout(timer);
  }, []);

  if (done) return null;

  return (
    <div className="splash" role="presentation" aria-hidden="true">
      <span className="splash-ring" />
      <img className="splash-logo" src="/logo.png" alt="" />
      <h1 className="splash-title">Arc Legacy</h1>
      <p className="splash-tagline">Stablecoin inheritance vaults on Arc</p>
    </div>
  );
}
