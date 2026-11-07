import { cleanup } from "@testing-library/react";

/** Unmounts the React root that `story.run()` left mounted; RTL's `cleanup` does not know it (issue 1622). */
export async function unmountStoryRuns(story: { load: () => Promise<void> }): Promise<void> {
  cleanup();
  await story.load();
}
