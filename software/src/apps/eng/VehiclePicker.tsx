import { useVehicles } from "../../lib/live";
import { setQuery, useQuery } from "../../lib/router";

/** Vehicle selection kept in the URL (?v=UNIT-14) so links from tickets and the console land on the right one. */
export function useVehicleParam(fallback = true) {
  const q = useQuery().get("v");
  const vs = useVehicles();
  return q ?? (fallback ? vs[0]?.id ?? null : null);
}

export function VehiclePicker({ allowAll }: { allowAll?: boolean }) {
  const vs = useVehicles();
  const id = useVehicleParam(!allowAll);
  return (
    <select className="select sm" style={{ width: 170 }} value={id ?? ""} onChange={(e) => setQuery({ v: e.target.value || null })} aria-label="Vehicle">
      {allowAll && <option value="">All vehicles</option>}
      {vs.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
    </select>
  );
}
