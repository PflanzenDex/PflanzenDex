// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, describe, it } from "vitest";
import { expectOneLoadingStatus } from "@/shared/ui/display/skeleton/loading-contract";
import table from "../../../social.de.json";
import { FriendEquipmentSkeleton } from "./friend-equipment.skeleton";

afterEach(cleanup);

describe("US-QS-14 issue 1697 · the devices of a friend show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(
      <FriendEquipmentSkeleton label={table["equipment.loading"]} />,
      table["equipment.loading"],
    ));
});
