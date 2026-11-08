// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, describe, it } from "vitest";
import { expectOneLoadingStatus } from "@/shared/ui/display/skeleton/loading-contract";
import table from "./create-with-siblings.de.json";
import { CreateFormSkeleton } from "./create-with-siblings.skeleton";

afterEach(cleanup);

describe("US-QS-14 issue 1697 · the create form of a species shows its shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(<CreateFormSkeleton label={table["loading"]} />, table["loading"]));
});
