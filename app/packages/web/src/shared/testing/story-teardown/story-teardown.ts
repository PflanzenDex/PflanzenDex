import { composeStory } from "@storybook/react-vite";
import { cleanup } from "@testing-library/react";

// A story with no loaders and no beforeEach: its load() only runs the module-global cleanups of Storybook's
// composed stories (the unmount of every run()), so nothing new is mounted (issue 1622).
const flush = composeStory({}, { title: "teardown" });

/** Unmounts the React root that `story.run()` left mounted; RTL's `cleanup` does not know it (issue 1622). */
export async function unmountStoryRuns(): Promise<void> {
  cleanup();
  await flush.load();
}
