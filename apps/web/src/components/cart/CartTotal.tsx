import { formatCents } from "../../lib/money";

export function CartTotal({ totalCents }: { totalCents: number }) {
  return (
    <p>
      <strong>Total: {formatCents(totalCents)}</strong>
    </p>
  );
}
