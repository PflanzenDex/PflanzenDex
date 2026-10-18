import { Link } from "react-router";
import { Button } from "@/components/ui/button/button";

/** The two ways to swap, modes of "Freunde": the complete exchange (US-SOZ-09) and the cards that match the wishlist (US-TAU-01). */
export function FriendsLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="touch">
        <Link to="/friends/exchange">Zur Tauschbörse</Link>
      </Button>
      <Button asChild variant="outline" size="touch">
        <Link to="/friends/match">Passende Angebote</Link>
      </Button>
    </div>
  );
}
