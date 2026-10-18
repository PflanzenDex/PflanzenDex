import { lazy, Suspense } from "react";
import { useFeature } from "../../../kernel";

const Switch = lazy(() => import("../friends-switch/friends-switch"));

/**
 * The switch of a wish for friends (DM-TAU-02) loads on its own after the first paint (DS-08) and exists only while the
 * social part of the app is on (US-DEV-06).
 */
export function LazyFriendsSwitch(props: {
  api: string;
  token: () => Promise<string | undefined>;
  wishId: string;
  title: string;
}) {
  const social = useFeature("social");
  if (!social) return null;
  return (
    <Suspense fallback={null}>
      <Switch {...props} />
    </Suspense>
  );
}
