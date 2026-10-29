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
} from "@/components/shared/navigation/nav-model/navigation/navigation";

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
  const keep = { keepFocus: true };
  const redirects: [string, string][] = [
    [LEGACY_TREATMENTS_PATH, todayAddress("treatments")],
    [LEGACY_HINTS_PATH, todayAddress("hints")],
    [LEGACY_SETTINGS_PATH, accountAddress("settings")],
    [LEGACY_WISHLIST_PATH, WISHLIST_MODE_ADDRESS],
    [LEGACY_DIFFICULTY_PATH, DIFFICULTY_ADDRESS],
    [LEGACY_CARE_PHASES_PATH, PHASES_ADDRESS],
    [LEGACY_CARE_PROFILE_PATH, SPECIES_MODE_ADDRESS],
    [LEGACY_LIGHT_PATH, MANAGE_ADDRESS],
    [LEGACY_SPECIES_PATH, CATALOG_ADDRESS],
  ];
  return [
    ...redirects.map(([path, to]) => (
      <Route key={path} path={path} element={<Navigate to={to} replace state={keep} />} />
    )),
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
