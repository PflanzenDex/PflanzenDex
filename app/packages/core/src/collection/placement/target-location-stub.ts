import type { Species } from "../../catalog";
import type { TargetLocationSource } from "../shared/types";

/** Target-location stub: remembers the calls so tests can check what the port learns. */
export class TargetLocationStub implements TargetLocationSource {
  readonly calls: { userId: string; speciesId: string; today: string }[] = [];
  readonly growthCalls: { userId: string; speciesId: string }[] = [];

  constructor(
    private readonly response: string | null,
    private readonly growth: string | null = null,
  ) {}

  async growthLocation(userId: string, species: Species): Promise<string | null> {
    this.growthCalls.push({ userId, speciesId: species.id });
    return this.growth;
  }

  async targetLocation(userId: string, species: Species, today: string): Promise<string | null> {
    this.calls.push({ userId, speciesId: species.id, today });
    return this.response;
  }
}
