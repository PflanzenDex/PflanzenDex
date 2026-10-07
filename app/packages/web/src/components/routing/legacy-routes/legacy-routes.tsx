import { Navigate, Route } from "react-router";
import {
  DIFFICULTY_ADDRESS,
  LEGACY_DIFFICULTY_PATH,
  LEGACY_WISHLIST_PATH,
  WISHLIST_MODE_ADDRESS,
  LEGACY_HINTS_PATH,
  LEGACY_SETTINGS_PATH,
  LEGACY_POKEDEX_PATH,
  LEGACY_TREATMENTS_PATH,
  SPECIES_MODE_ADDRESS,
  accountAddress,
  todayAddress,
} from "@/navigation";

/**
 * The addresses of destinations that no longer exist: old links and bookmarks keep working (US-QS-14). The Pokédex is
 * the species mode of the Sammlung; Behandlung and Hinweise are sections of Heute, Einstellungen is a section of Konto; Wunschliste and Artenvergleich are the wishlist mode and an arrangement of the species. The state keeps the focus where the
 * target view puts it (the section heading), instead of RouteFocus moving it to the main heading.
 */
export function legacyRoutes() {
  return [
    <Route
      key="treatments"
      path={LEGACY_TREATMENTS_PATH}
      element={<Navigate to={todayAddress("treatments")} replace state={{ keepFocus: true }} />}
    />,
    <Route
      key="hints"
      path={LEGACY_HINTS_PATH}
      element={<Navigate to={todayAddress("hints")} replace state={{ keepFocus: true }} />}
    />,
    <Route
      key="settings"
      path={LEGACY_SETTINGS_PATH}
      element={<Navigate to={accountAddress("settings")} replace state={{ keepFocus: true }} />}
    />,
    <Route
      key="wishlist"
      path={LEGACY_WISHLIST_PATH}
      element={<Navigate to={WISHLIST_MODE_ADDRESS} replace state={{ keepFocus: true }} />}
    />,
    <Route
      key="difficulty"
      path={LEGACY_DIFFICULTY_PATH}
      element={<Navigate to={DIFFICULTY_ADDRESS} replace state={{ keepFocus: true }} />}
    />,
    <Route
      key="pokedex"
      path={`${LEGACY_POKEDEX_PATH}/*`}
      element={<Navigate to={SPECIES_MODE_ADDRESS} replace />}
    />,
  ];
}
