import { explorerTx, shortAddress } from "../lib/chain";

/**
 * On-chain receipt for an App Kit action that settled on Arc — renders the
 * returned transaction hash as a link to Arcscan so a run leaves verifiable
 * proof rather than just a "✓". Use `arc={false}` for hashes that settle on a
 * source chain (e.g. the CCTP burn leg), which shows the hash without an Arc
 * explorer link that would resolve to the wrong chain.
 */
export function KitTxLink({ hash, arc = true }: { hash: string; arc?: boolean }) {
  if (arc) {
    return (
      <a
        className="tx-link"
        href={explorerTx(hash)}
        target="_blank"
        rel="noreferrer"
      >
        view on Arcscan ↗
      </a>
    );
  }
  return <code className="tx-hash">{shortAddress(hash)}</code>;
}
