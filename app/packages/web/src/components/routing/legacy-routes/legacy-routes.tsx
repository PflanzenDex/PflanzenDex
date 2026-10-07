import { Navigate, Route, useParams } from "react-router";
import {
  CATALOG_ADDRESS,
  DIFFICULTY_ADDRESS,
  LEGACY_CARE_PHASES_PATH,
  LEGACY_CARE_PROFILE_PATH,
  LEGACY_LIGHT_PATH,
  MANAGE_ADDRESS,
  PHASES_ADDRESS,
  LEGACY_DIFFICULTY_PATH,
  LEGACY_WISHLIST_PATH,
  WISHLIST_MODE_ADDRESS,
  LEGACY_HINTS_PATH,
  LEGACY_SETTINGS_PATH,
  LEGACY_POKEDEX_PATH,
  LEGACY_TREATMENTS_PATH,
  SPECIES_MODE_ADDRESS,
  LEGACY_SPECIES_PATH,
  accountAddress,
  profileAddress,
  todayAddress,
} from "@/navigation";

/** The old address of one species profile: the same profile below Entdecken. */
function ProfileRedirect() {
  const { profileId } = useParams();
  return <Navigate to={profileAddress(profileId ?? "")} replace />;
}

/**
 * The addresses of destinations that no longer exist: old links and bookmarks keep working (US-QS-14). The Pokédex is
 * the species mode of the Sammlung; Behandlung and Hinweise are sections of Heute, Einstellungen is a section of Konto; Arten is the catalog mode of Entdecken (`/species` only; the profile addresses below it stay). Wunschliste and Artenvergleich are the wishlist mode and an arrangement of the species. Pflegephasen is a grouping of the plants,
 Pflegeprofil a section of the species profile (its address opens the species mode, where a species is chosen) and Standorte und Licht the management view of the plants. The state keeps the focus where the
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
      key="care-phases"
      path={LEGACY_CARE_PHASES_PATH}
      element={<Navigate to={PHASES_ADDRESS} replace state={{ keepFocus: true }} />}
    />,
    <Route
      key="care-profile"
      path={LEGACY_CARE_PROFILE_PATH}
      element={<Navigate to={SPECIES_MODE_ADDRESS} replace state={{ keepFocus: true }} />}
    />,
    <Route
      key="light"
      path={LEGACY_LIGHT_PATH}
      element={<Navigate to={MANAGE_ADDRESS} replace state={{ keepFocus: true }} />}
    />,
    <Route
      key="species"
      path={LEGACY_SPECIES_PATH}
      element={<Navigate to={CATALOG_ADDRESS} replace state={{ keepFocus: true }} />}
    />,
    <Route
      key="species-profile"
      path={`${LEGACY_SPECIES_PATH}/:profileId`}
      element={<ProfileRedirect />}
    />,
    <Route
      key="pokedex"
      path={`${LEGACY_POKEDEX_PATH}/*`}
      element={<Navigate to={SPECIES_MODE_ADDRESS} replace />}
    />,
  ];
}
